"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getBrowserSupabaseClient,
  getBrowserSupabaseRedirectUrl,
} from "@/lib/supabase/client";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);

    try {
      const supabase = getBrowserSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: getBrowserSupabaseRedirectUrl(),
        },
      });

      if (error) {
        setError(error.message);
        setBusy(false);
      }
    } catch {
      setError("Failed to start sign in.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <h1 className="font-[family-name:var(--font-doto)] text-4xl font-bold tracking-tight">
            Nabit
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to continue
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-300/40 bg-red-100/70 p-3 text-sm text-red-900">
            {error}
          </div>
        ) : null}

        <Button
          className="w-full"
          disabled={busy}
          onClick={() => void signIn()}
          size="lg"
        >
          {busy ? "Redirecting..." : "Sign in with GitHub"}
        </Button>
      </div>
    </div>
  );
}
