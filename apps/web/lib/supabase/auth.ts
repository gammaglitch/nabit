"use client";

import { parseAuthCallbackUrl } from "@repo/auth";
import { syncBrowserAuthCookie } from "./auth-cookie";
import { getBrowserSupabaseClient } from "./client";

export async function completeBrowserSupabaseAuth(url: string) {
  const callback = parseAuthCallbackUrl(url);
  const supabase = getBrowserSupabaseClient();

  if (callback.errorDescription) {
    throw new Error(callback.errorDescription);
  }

  if (callback.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(callback.code);

    if (error) {
      throw error;
    }
  } else if (callback.accessToken && callback.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    });

    if (error) {
      throw error;
    }
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  syncBrowserAuthCookie(data.session);
  return data.session;
}
