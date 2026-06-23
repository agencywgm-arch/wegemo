// chat-agent — single multi-mode endpoint backed by OpenAI gpt-4o-mini.
// Modes: dashboard | customer | setup-menu | setup-inventory | influencer-estimate
import { corsHeaders, json } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = "gpt-4o-mini";

// In-memory sliding-window rate limit: 20 req / minute / IP.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!OPENAI_API_KEY) return json({ error: "openai_not_configured" }, 500);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    if (rateLimited(ip)) return json({ error: "rate_limited" }, 429);

    const { messages = [], mode = "dashboard", text = "", context = "" } = await req.json();

    if (mode === "setup-menu") {
      const content = await callOpenAI(
        [
          { role: "system", content: SETUP_MENU_SYSTEM },
          { role: "user", content: text },
        ],
        4096,
        true,
      );
      return json(safeParse(content, { items: [] }));
    }

    if (mode === "setup-inventory") {
      const content = await callOpenAI(
        [
          { role: "system", content: SETUP_INVENTORY_SYSTEM },
          { role: "user", content: text },
        ],
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

    const system = mode === "customer" ? CUSTOMER_SYSTEM : DASHBOARD_SYSTEM;
    const sys = context ? `${system}\n\nContexte: ${context}` : system;
    const content = await callOpenAI(
      [{ role: "system", content: sys }, ...messages],
      512,
    );
    return json({ content });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function safeParse(s: string, fallback: unknown) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}
