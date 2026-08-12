// hubrise-connect — échange le code OAuth2 HubRise contre un token d'accès,
// enregistre la connexion et abonne Wegemo aux événements de commande.
//
// Le token n'est écrit que dans pos_connections, table sans policy RLS : il
// n'est jamais lisible depuis le navigateur. Le dashboard interroge l'état de
// connexion via la fonction get_pos_connection_status(), qui ne renvoie aucun
// secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { hubriseFetch, HUBRISE_OAUTH_BASE } from "../_shared/hubrise.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID = Deno.env.get("HUBRISE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("HUBRISE_CLIENT_SECRET") ?? "";
// URL publique de la fonction hubrise-webhook, enregistrée comme callback.
const WEBHOOK_URL = Deno.env.get("HUBRISE_WEBHOOK_URL") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return json({ error: "hubrise_app_not_configured" }, 500);
    }

    const { code, restaurant_id, redirect_uri, pos_vendor = "clyo" } = await req
      .json();
    if (!code || !restaurant_id || !redirect_uri) {
      return json({ error: "missing_params" }, 400);
    }

    // Seul le propriétaire du restaurant peut y brancher une caisse. On vérifie
    // via le JWT de l'appelant : le service-role qui suit contourne RLS, il ne
    // faut donc surtout pas se reposer dessus pour l'autorisation.
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: restaurant } = await admin
      .from("restaurants")
      .select("id, owner_id")
      .eq("id", restaurant_id)
      .maybeSingle();
    if (!restaurant || restaurant.owner_id !== user.id) {
      return json({ error: "not_authorized" }, 403);
    }

    // --- Échange du code contre un token ------------------------------------
    // HubRise attend les identifiants du client dans l'en-tête Basic (schéma
    // OAuth2 standard) et le code dans un corps form-urlencoded. On répète
    // client_id dans le corps : inoffensif, et certains serveurs OAuth s'en
    // servent en priorité.
    const basic = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
    const tokenRes = await fetch(`${HUBRISE_OAUTH_BASE}/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri,
        client_id: CLIENT_ID,
      }),
    });
    // Lu en texte d'abord : une erreur HubRise peut ne pas être du JSON
    // (page d'erreur HTML, réponse vide), et .json() planterait sans jamais
    // laisser voir le vrai motif de refus.
    const tokenRaw = await tokenRes.text();
    let tokens: Record<string, unknown> = {};
    try { tokens = tokenRaw ? JSON.parse(tokenRaw) : {}; } catch { /* pas du JSON */ }

    if (!tokenRes.ok || !tokens?.access_token) {
      const detail = (tokens?.error_description as string) ?? (tokens?.error as string) ??
        (tokens?.message as string) ?? tokenRaw.slice(0, 300) ?? `http_${tokenRes.status}`;
      await logSync(admin, restaurant_id, null, "connect", false, tokenRes.status,
        `échange de token refusé (${tokenRes.status}) : ${detail} — redirect_uri envoyé: ${redirect_uri}`);
      return json({ error: `token_exchange_failed: ${detail}` }, 400);
    }

    const accessToken = tokens.access_token as string;
    // HubRise renvoie account_id / location_id avec le token ; on retombe sur
    // GET /location si l'un des deux manque.
    let accountId: string | null = (tokens.account_id as string) ?? null;
    let locationId: string | null = (tokens.location_id as string) ?? null;

    if (!locationId) {
      const loc = await hubriseFetch("/location", accessToken);
      if (loc.ok && loc.data && typeof loc.data === "object") {
        const d = loc.data as Record<string, unknown>;
        locationId = (d.id as string) ?? null;
        accountId = accountId ?? ((d.account_id as string) ?? null);
      }
    }

    if (!locationId) {
      await logSync(admin, restaurant_id, null, "connect", false, 0, "no_location_in_scope");
      return json({ error: "no_location_in_scope" }, 400);
    }

    // --- Abonnement aux événements de commande ------------------------------
    // Un callback est propre à une connexion et il ne peut y en avoir qu'un :
    // POST /callback crée ou remplace. Un échec ici n'empêche pas d'envoyer des
    // commandes, seuls les retours de statut manqueraient — on le signale sans
    // faire échouer la connexion.
    let callbackWarning: string | null = null;
    if (WEBHOOK_URL) {
      const cb = await hubriseFetch("/callback", accessToken, {
        method: "POST",
        body: JSON.stringify({
          url: WEBHOOK_URL,
          events: { order: ["create", "update"] },
        }),
      });
      if (!cb.ok) callbackWarning = cb.error ?? "callback_registration_failed";
    } else {
      callbackWarning = "webhook_url_not_configured";
    }

    // --- Enregistrement de la connexion -------------------------------------
    const { error: upsertError } = await admin.from("pos_connections").upsert(
      {
        restaurant_id,
        provider: "hubrise",
        pos_vendor: ["clyo", "other", "unknown"].includes(pos_vendor) ? pos_vendor : "unknown",
        hubrise_account_id: accountId,
        hubrise_location_id: locationId,
        access_token: accessToken,
        status: "connected",
        last_error: callbackWarning,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id" },
    );
    if (upsertError) return json({ error: upsertError.message }, 500);

    await logSync(admin, restaurant_id, null, "connect", true, 200,
      callbackWarning ? `connecté (avertissement : ${callbackWarning})` : "connecté");

    return json({
      connected: true,
      location_id: locationId,
      account_id: accountId,
      warning: callbackWarning,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

async function logSync(
  admin: ReturnType<typeof createClient>,
  restaurantId: string,
  orderId: string | null,
  action: string,
  ok: boolean,
  httpStatus: number,
  message: string,
) {
  await admin.from("pos_sync_log").insert({
    restaurant_id: restaurantId,
    order_id: orderId,
    direction: "outbound",
    action,
    ok,
    http_status: httpStatus,
    message: message?.slice(0, 500) ?? null,
  });
}
