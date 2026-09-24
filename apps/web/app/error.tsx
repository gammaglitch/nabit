"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/error-screen";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // The default page swallows this, which is how a broken deploy looked like
  // nothing at all in the logs.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <ErrorScreen error={error} reset={reset} />;
}
