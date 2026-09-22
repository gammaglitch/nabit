"use client";

import { ErrorScreen } from "@/components/error-screen";

/**
 * Catches what error.tsx cannot: a throw in the root layout or in a provider
 * above it, which is exactly where a dead session first bites. It replaces the
 * whole document, so it brings its own html/body.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
