"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/react";

/**
 * Removes an archived item for good.
 *
 * There is no soft delete and no undo: the row goes, and the schema cascades
 * take its snapshots, extractions, comments, tags and asset links with it.
 * Callers are expected to confirm first.
 *
 * `crawl.list` is invalidated alongside the item queries because a crawl's
 * page rows keep a nullable `item_id` — deleting an archived page leaves the
 * crawl's tree intact but its counts and that page's readability stale.
 */
export function useDeleteItem() {
  const utils = trpc.useUtils();

  const invalidate = useCallback(async () => {
    await Promise.all([
      utils.ingest.list.invalidate(),
      utils.ingest.get.invalidate(),
      utils.crawl.list.invalidate(),
      utils.crawl.get.invalidate(),
    ]);
  }, [utils]);

  const remove = trpc.ingest.delete.useMutation({ onSuccess: invalidate });

  const deleteItem = useCallback(
    async (itemId: number) => remove.mutateAsync({ id: itemId }),
    [remove],
  );

  return { deleteItem, isDeleting: remove.isPending };
}
