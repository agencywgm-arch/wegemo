import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// When env vars are missing we still export a null client so the app can run
// fully in offline "demo" mode without crashing.
export const hasSupabase = Boolean(url && anonKey);

export const supabase = hasSupabase
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const SUPABASE_URL = url || "";
export const SUPABASE_ANON_KEY = anonKey || "";

// Helper to call an edge function with the user's JWT when available.
export async function callFunction(name, body) {
  if (!supabase) throw new Error("supabase_not_configured");
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}
