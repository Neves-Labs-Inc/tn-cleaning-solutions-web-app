import "server-only";

// Relative import so node --test can resolve it (no `@/` alias there).
import { requireEnv } from "./env.ts";

export function getSupabaseSecretKey(): string {
  return requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
}
