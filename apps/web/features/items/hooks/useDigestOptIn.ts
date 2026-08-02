"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/react";

export function useDigestOptIn() {
  const utils = trpc.useUtils();

  const invalidate = useCallback(async () => {
    await Promise.all([
      utils.ingest.list.invalidate(),
      utils.ingest.get.invalidate(),
    ]);
  }, [utils]);

  const setDigestOptIn = trpc.ingest.setDigestOptIn.useMutation({
    onSuccess: invalidate,
  });

  const toggleDigestOptIn = useCallback(
    async (itemId: number, digestOptIn: boolean) => {
      await setDigestOptIn.mutateAsync({ digestOptIn, id: itemId });
    },
    [setDigestOptIn],
  );

  return { toggleDigestOptIn, isTogglingDigestOptIn: setDigestOptIn.isPending };
}
