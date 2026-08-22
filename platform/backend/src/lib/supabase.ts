import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

function missingSupabaseConfig(clientName: string) {
  const missing = ["SUPABASE_URL", clientName].filter((key) => !process.env[key]);
  return Object.assign(
    new Error(`Supabase não configurado. Variáveis ausentes: ${missing.join(", ")}.`),
    { statusCode: 503 },
  );
}

function buildSupabaseClient(keyName: "SUPABASE_ANON_KEY" | "SUPABASE_SERVICE_ROLE_KEY") {
  const key = process.env[keyName];
  if (!env.SUPABASE_URL || !key) throw missingSupabaseConfig(keyName);

  return createClient(env.SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function lazySupabaseClient(getClient: () => SupabaseClient) {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      const client = getClient() as unknown as Record<PropertyKey, unknown>;
      const value = client[prop];
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

let authClient: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

export const supabaseAuth = lazySupabaseClient(() => {
  authClient ??= buildSupabaseClient("SUPABASE_ANON_KEY");
  return authClient;
});

export const supabaseAdmin = lazySupabaseClient(() => {
  adminClient ??= buildSupabaseClient("SUPABASE_SERVICE_ROLE_KEY");
  return adminClient;
});
