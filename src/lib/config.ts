function normalizeSupabaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    return new URL(value.trim()).origin;
  } catch {
    return value.trim();
  }
}

export const env = {
  supabaseUrl: normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined),
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
};

export const missingEnv = Object.entries({
  VITE_SUPABASE_URL: env.supabaseUrl,
  VITE_SUPABASE_ANON_KEY: env.supabaseAnonKey,
})
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabaseAnonKey);
