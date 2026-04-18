export type SupabaseAuthConfig = {
  anonKey: string;
  url: string;
};

type SupabaseAuthConfigInput = {
  anonKey?: string | null;
  url?: string | null;
};

export function createSupabaseAuthConfig(
  input: SupabaseAuthConfigInput,
): SupabaseAuthConfig {
  const url = input.url?.trim();
  const anonKey = input.anonKey?.trim();

  if (!url) {
    throw new Error("Supabase auth config is missing the project URL.");
  }

  if (!anonKey) {
    throw new Error("Supabase auth config is missing the anon key.");
  }

  return {
    url: normalizeSupabaseUrl(url),
    anonKey,
  };
}

function normalizeSupabaseUrl(url: string) {
  const normalizedUrl = url.endsWith("/") ? url.slice(0, -1) : url;

  try {
    return new URL(normalizedUrl).toString().replace(/\/$/, "");
  } catch {
    throw new Error("Supabase auth config contains an invalid project URL.");
  }
}
