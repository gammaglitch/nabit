"use client";

import {
  getUserAvatarUrl,
  getUserDisplayName,
  toAuthSessionSummary,
} from "@repo/auth";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { getBrowserSupabaseRedirectUrl } from "@/lib/supabase/client";

type Notice =
  | { kind: "error"; text: string }
  | { kind: "success"; text: string };

const oauthProvider = "github";

interface UseAuthPanelOptions {
  session: Session | null;
  supabaseClient: SupabaseClient | null;
}

export function useAuthPanel({ session, supabaseClient }: UseAuthPanelOptions) {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyAction, setBusyAction] = useState<
    "magic-link" | "oauth" | "sign-out" | null
  >(null);

  const sessionSummary = session ? toAuthSessionSummary(session) : null;
  const displayName = session ? getUserDisplayName(session.user) : null;
  const avatarUrl = session ? getUserAvatarUrl(session.user) : null;

  const sendMagicLink = async () => {
    if (!supabaseClient) {
      return;
    }

    if (!email.trim()) {
      setNotice({
        kind: "error",
        text: "Enter an email address before requesting a magic link.",
      });
      return;
    }

    setBusyAction("magic-link");
    setNotice(null);

    const { error } = await supabaseClient.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: getBrowserSupabaseRedirectUrl(),
      },
    });

    setBusyAction(null);

    if (error) {
      setNotice({
        kind: "error",
        text: error.message,
      });
      return;
    }

    setNotice({
      kind: "success",
      text: "Magic link sent. Open it in the same browser to complete sign in.",
    });
  };

  const signInWithOAuth = async () => {
    if (!supabaseClient) {
      return;
    }

    setBusyAction("oauth");
    setNotice(null);

    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: oauthProvider,
      options: {
        redirectTo: getBrowserSupabaseRedirectUrl(),
      },
    });

    if (error) {
      setBusyAction(null);
      setNotice({
        kind: "error",
        text: error.message,
      });
    }
  };

  const signOut = async () => {
    if (!supabaseClient) {
      return;
    }

    setBusyAction("sign-out");
    setNotice(null);

    const { error } = await supabaseClient.auth.signOut();

    setBusyAction(null);

    if (error) {
      setNotice({
        kind: "error",
        text: error.message,
      });
      return;
    }

    setNotice({
      kind: "success",
      text: "Signed out.",
    });
  };

  return {
    avatarUrl,
    busyAction,
    displayName,
    email,
    notice,
    oauthProvider,
    sendMagicLink,
    sessionSummary,
    setEmail,
    signInWithOAuth,
    signOut,
  };
}
