"use client";

import { createSupabaseAuthConfig, getAuthCallbackUrl } from "@repo/auth";
import { createClient } from "@supabase/supabase-js";

let browserSupabaseClient: ReturnType<typeof createClient> | null = null;

export function getBrowserSupabaseConfig() {
  return createSupabaseAuthConfig({
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}

export function getBrowserSupabaseClient() {
  if (!browserSupabaseClient) {
    const config = getBrowserSupabaseConfig();

    browserSupabaseClient = createClient(config.url, config.anonKey, {
      auth: {
        detectSessionInUrl: false,
      },
    });
  }

  return browserSupabaseClient;
}

export function getBrowserSupabaseRedirectUrl() {
  return getAuthCallbackUrl(window.location.origin);
}

export async function getBrowserSupabaseAccessToken() {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
