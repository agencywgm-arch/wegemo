// ============================================================================
// chat-agent — SELF-CONTAINED version for the Supabase Dashboard editor.
// No imports: paste this whole file into Dashboard → Edge Functions →
// "Deploy a new function" → name it exactly "chat-agent" → paste → Deploy.
// OPENAI_API_KEY (secret) is needed for the AI modes; the influencer-fetch
// mode (real public-profile scraping) works WITHOUT any key.
// Mirrors supabase/functions/chat-agent/index.ts with CORS inlined.
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = "gpt-4o-mini";

const RATE_LIMIT = 20;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_LIMIT;
}

const DASHBOARD_SYSTEM = `Tu es l'assistant administrateur de Wegemo, un SaaS de commande au restaurant par QR code.
Tu aides le restaurateur sur: gestion du stock et de l'inventaire, génération de QR codes par table,
vue cuisine (kanban des commandes), paiements Stripe, campagnes email (CRM), promotions et codes promo,
caisse et rapport Z. Réponds de façon concise, actionnable et chaleureuse.`;

const CUSTOMER_SYSTEM = `Tu es l'assistant client d'un restaurant utilisant Wegemo.
Tu réponds aux questions sur les allergènes, les ingrédients et les préférences alimentaires.
Détecte automatiquement la langue du client et réponds dans cette langue. Sois bref et rassurant.`;

const SETUP_MENU_SYSTEM = `Tu extrais un menu de restaurant depuis du texte brut (site web, PDF, WhatsApp).
Renvoie STRICTEMENT un JSON valide de la forme:
{"items":[{"name":"","description":"","price":0,"category":"","emoji":""}]}
Pas de texte hors du JSON. Choisis un emoji pertinent par plat et une catégorie cohérente.`;

const SETUP_INVENTORY_SYSTEM = `À partir d'une liste de plats, déduis une liste d'ingrédients réalistes et
une matrice de recettes (quantité par portion). Renvoie STRICTEMENT un JSON de la forme:
{"ingredients":[{"name":"","unit":"kg","emoji":"📦","stock":0}],"recipes":{"Nom du plat":{"Nom ingrédient":0.2}}}
Pas de texte hors du JSON.`;

const INFLUENCER_ESTIMATE_SYSTEM = `Tu estimes les métriques publiques plausibles d'un profil de créateur
(Instagram/TikTok/YouTube) à partir de son URL ou @handle, pour une pré-analyse de partenariat restaurant.
Tu n'as PAS d'accès direct au profil : produis une ESTIMATION prudente et cohérente d'après les conventions
du handle et de la plateforme. Renvoie STRICTEMENT un JSON:
{"followers":int,"avgLikes":int,"avgComments":int,"posts30":int,"partnerships":int,"localPct":int,"niche":"","confidence":"low|medium|high","note":"phrase courte en français"}
Règles: avgLikes/avgComments cohérents avec un engagement réaliste (2 à 8% des followers, commentaires ~5-15% des likes);
posts30 = posts sur 30 jours (souvent 4 à 20); partnerships = collaborations restaurants estimées sur 3 mois (souvent 0 à 2);
localPct = % d'audience locale estimé (0-100). Sois prudent, n'invente pas de chiffres extrêmes. Aucun texte hors du JSON.`;

const INFLUENCER_CONTENT_SYSTEM = `Tu es un analyste partenariats restaurant. À partir des SIGNAUX RÉELS fournis
(nom du créateur, bio, plateforme, followers, engagement, région, type de restaurant), tu juges l'adéquation
du contenu avec le restaurant et sa qualité apparente. Base-toi UNIQUEMENT sur ces signaux; si la bio est vide
ou pauvre, dis-le et baisse la confiance. N'invente pas de détails non fournis. Renvoie STRICTEMENT un JSON:
{"niche":"","contentType":"","quality":"low|medium|high","qualityReason":"","fitScore":1-10,"fitReason":"","audienceGuess":"","confidence":"low|medium|high","summary":"2 phrases max en français"}
fitScore: 1-3 = sans rapport, 4-6 = partiel, 7-8 = bon, 9-10 = parfait. Aucun texte hors du JSON.`;

async function callOpenAI(messages: unknown[], maxTokens: number, jsonMode = false) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: jsonMode ? 0.2 : 0.6,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`openai_error: ${res.status} ${txt}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function safeParse(s: string, fallback: unknown) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

// --- Real public-profile fetch (no API key) --------------------------------
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function cleanHandle(input: string): string {
  let s = (input || "").trim();
  s = s.replace(/^https?:\/\/(www\.)?(tiktok\.com|instagram\.com)\//i, "");
  s = s.replace(/[?#].*$/, "");
  s = s.replace(/^@/, "").replace(/\/+$/, "");
  return s.replace(/^@/, "");
}
function expandNum(s: string): number {
  const t = (s || "").replace(/[, ]/g, "").toUpperCase();
  const mult = t.endsWith("K") ? 1e3 : t.endsWith("M") ? 1e6 : t.endsWith("B") ? 1e9 : 1;
  const n = parseFloat(t);
  return Math.round((isNaN(n) ? 0 : n) * mult);
}

async function fetchTikTok(handle: string) {
  const res = await fetch(`https://www.tiktok.com/@${handle}`, {
    headers: { "User-Agent": BROWSER_UA, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" },
  });
  const html = await res.text();
  const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]+?)<\/script>/);
  if (!m) return { real: false, error: "tiktok_blocked" };
  let stats: Record<string, number> | undefined, user: Record<string, unknown> | undefined;
  try {
    const j = JSON.parse(m[1]);
    const info = j?.["__DEFAULT_SCOPE__"]?.["webapp.user-detail"]?.userInfo;
    stats = info?.stats; user = info?.user;
  } catch { /* fallthrough */ }
  if (!stats?.followerCount) return { real: false, error: "tiktok_no_stats" };
  const followers = stats.followerCount || 0;
  const hearts = stats.heartCount || stats.heart || 0;
  const videos = stats.videoCount || 0;
  const avgLikes = videos > 0 ? Math.round(hearts / videos) : 0;
  return {
    real: true, platform: "tiktok", followers, avgLikes,
    avgComments: Math.round(avgLikes * 0.08), videoCount: videos,
    nickname: String(user?.nickname || handle), bio: String(user?.signature || ""),
    region: String(user?.region || ""), verified: Boolean(user?.verified),
    fields_real: ["followers", "avgLikes"],
  };
}

async function fetchInstagram(handle: string) {
  const res = await fetch(`https://www.instagram.com/${handle}/`, {
    headers: { "User-Agent": BROWSER_UA, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" },
  });
  const html = await res.text();
  const m = html.match(/<meta property="og:description" content="([^"]+)"/);
  if (!m) return { real: false, error: "instagram_blocked" };
  const fm = m[1].match(/([\d.,]+\s?[KMB]?)\s+Followers/i);
  const followers = fm ? expandNum(fm[1]) : 0;
  if (!followers) return { real: false, error: "instagram_no_followers" };
  return { real: true, platform: "instagram", followers, fields_real: ["followers"] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    if (rateLimited(ip)) return json({ error: "rate_limited" }, 429);

    const { messages = [], mode = "dashboard", text = "", context = "" } = await req.json();

    // Real public-profile scraping needs no OpenAI key.
    if (mode === "influencer-fetch") {
      const handle = cleanHandle(text);
      const isIG = context === "instagram" || /instagram/i.test(text);
      try {
        const data = isIG ? await fetchInstagram(handle) : await fetchTikTok(handle);
        return json(data);
      } catch (e) {
        return json({ real: false, error: String(e?.message ?? e) });
      }
    }

    if (!OPENAI_API_KEY) return json({ error: "openai_not_configured" }, 500);

    if (mode === "setup-menu") {
      const content = await callOpenAI(
        [{ role: "system", content: SETUP_MENU_SYSTEM }, { role: "user", content: text }],
        4096,
        true,
      );
      return json(safeParse(content, { items: [] }));
    }

    if (mode === "setup-inventory") {
      const content = await callOpenAI(
        [{ role: "system", content: SETUP_INVENTORY_SYSTEM }, { role: "user", content: text }],
        4096,
        true,
      );
      return json(safeParse(content, { ingredients: [], recipes: {} }));
    }

    if (mode === "influencer-estimate") {
      const content = await callOpenAI(
        [
          { role: "system", content: INFLUENCER_ESTIMATE_SYSTEM },
          { role: "user", content: `Profil: ${text}${context ? ` (plateforme: ${context})` : ""}` },
        ],
        400,
        true,
      );
      return json(safeParse(content, {}));
    }

    if (mode === "influencer-content") {
      const content = await callOpenAI(
        [
          { role: "system", content: INFLUENCER_CONTENT_SYSTEM },
          { role: "user", content: text },
        ],
        400,
        true,
      );
      return json(safeParse(content, {}));
    }

    const system = mode === "customer" ? CUSTOMER_SYSTEM : DASHBOARD_SYSTEM;
    const sys = context ? `${system}\n\nContexte: ${context}` : system;
    const content = await callOpenAI([{ role: "system", content: sys }, ...messages], 512);
    return json({ content });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
