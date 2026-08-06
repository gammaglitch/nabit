"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/react";

/**
 * Rebuilds an item's extracted content from the snapshots already archived for
 * it, so an extractor fix reaches things captured before it landed.
 *
 * Never refetches the source — see IngestService.reextract.
 */
export function useReextract() {
  const utils = trpc.useUtils();

  const invalidate = useCallback(async () => {
    await Promise.all([
      utils.ingest.list.invalidate(),
      utils.ingest.get.invalidate(),
    ]);
  }, [utils]);

  const reextract = trpc.ingest.reextract.useMutation({
    onSuccess: invalidate,
  });

  const reextractItem = useCallback(
    async (itemId: number) => reextract.mutateAsync({ id: itemId }),
    [reextract],
  );

  return { isReextracting: reextract.isPending, reextractItem };
}
