// Kept free of server-only imports so client code and node --test can load it.

export type SupabasePublicEnv = { url: string; publishableKey: string };

// Takes the value instead of reading process.env[name]: Next only inlines literal
// `process.env.NEXT_PUBLIC_*` reads into the browser bundle.
// The message names the var and never includes its value.
export function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable ${name}`);

  return value;
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  return {
    url: requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    publishableKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}
