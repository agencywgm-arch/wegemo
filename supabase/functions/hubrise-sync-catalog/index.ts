// hubrise-sync-catalog — pousse le menu Wegemo vers le catalogue HubRise.
//
// Indispensable avant tout envoi de commande : la caisse ne reconnaît une
// ligne de commande que si son `sku_ref` existe dans le catalogue. À appeler à
// la connexion initiale puis à chaque modification du menu.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";
import { buildCatalogData, hubriseFetch } from "../_shared/hubrise.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { restaurant_id } = await req.json();
    if (!restaurant_id) return json({ error: "missing_restaurant" }, 400);

    // Autorisation : propriétaire du restaurant uniquement.
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: restaurant } = await admin
      .from("restaurants")
      .select("id, name, owner_id")
      .eq("id", restaurant_id)
      .maybeSingle();
    if (!restaurant || restaurant.owner_id !== user.id) {
      return json({ error: "not_authorized" }, 403);
    }

    const { data: conn } = await admin
      .from("pos_connections")
      .select("*")
      .eq("restaurant_id", restaurant_id)
      .maybeSingle();
    if (!conn?.access_token) return json({ error: "pos_not_connected" }, 400);

    const { data: items } = await admin
      .from("menu_items")
      .select("id, name, description, price, category, supplements, available, sort_order")
      .eq("restaurant_id", restaurant_id);

    if (!items?.length) return json({ error: "empty_menu" }, 400);

    const data = buildCatalogData(items);

    // Premier envoi : on crée le catalogue sur la location. Ensuite on met à
    // jour celui qu'on connaît déjà (PUT remplace intégralement le contenu).
    let call;
    let catalogId: string | null = conn.hubrise_catalog_id ?? null;

    if (catalogId) {
      call = await hubriseFetch(`/catalogs/${catalogId}`, conn.access_token, {
        method: "PUT",
        body: JSON.stringify({ name: `Wegemo — ${restaurant.name}`, data }),
      });
      // Le catalogue a pu être supprimé côté HubRise : on le recrée.
      if (!call.ok && call.status === 404) catalogId = null;
    }

    if (!catalogId) {
      call = await hubriseFetch(`/location/catalogs`, conn.access_token, {
        method: "POST",
        body: JSON.stringify({ name: `Wegemo — ${restaurant.name}`, data }),
      });
      if (call.ok && call.data && typeof call.data === "object") {
        catalogId = (call.data as Record<string, unknown>).id as string ?? null;
      }
    }

    const ok = !!call?.ok;
    await admin.from("pos_sync_log").insert({
      restaurant_id,
      direction: "outbound",
      action: "sync_catalog",
      ok,
      http_status: call?.status ?? 0,
      message: ok
        ? `${data.products.length} produits, ${data.categories.length} catégories`
        : (call?.error ?? "unknown_error").slice(0, 500),
    });

    if (!ok) {
      await admin.from("pos_connections").update({
        status: "error",
        last_error: (call?.error ?? "catalog_sync_failed").slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq("restaurant_id", restaurant_id);
      return json({ error: call?.error ?? "catalog_sync_failed" }, 502);
    }

    await admin.from("pos_connections").update({
      hubrise_catalog_id: catalogId,
      status: "connected",
      last_error: null,
      catalog_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("restaurant_id", restaurant_id);

    return json({
      synced: true,
      catalog_id: catalogId,
      products: data.products.length,
      categories: data.categories.length,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
