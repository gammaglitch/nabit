"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { syncBrowserAuthCookie } from "@/lib/supabase/auth-cookie";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export function useBrowserSupabaseSession() {
  const [session, setSession] = useState<Session | null>(null);

  const supabaseResult = useMemo(() => {
    try {
      return {
        client: getBrowserSupabaseClient(),
        error: null,
      };
    } catch (error) {
      return {
        client: null,
        error:
          error instanceof Error
            ? error.message
            : "Supabase is not configured.",
      };
    }
  }, []);

  useEffect(() => {
    if (!supabaseResult.client) {
      return;
    }

    const loadSession = async () => {
      const { data, error } = await supabaseResult.client.auth.getSession();

      if (error) {
        syncBrowserAuthCookie(null);
        return;
      }

      syncBrowserAuthCookie(data.session);
      setSession(data.session);
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabaseResult.client.auth.onAuthStateChange((_event, nextSession) => {
      syncBrowserAuthCookie(nextSession);
      setSession(nextSession);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabaseResult.client]);

  return {
    session,
    supabaseClient: supabaseResult.client,
    supabaseError: supabaseResult.error,
  };
}
