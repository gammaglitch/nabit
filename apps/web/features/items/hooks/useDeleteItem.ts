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
 * `crawl.list`/`crawl.get` go with the item queries because a crawl's page rows
 * keep a nullable `item_id` — deleting an archived page leaves the crawl's tree
 * standing but its counts and that page's readability stale.
 *
 * Deliberately does *not* invalidate `ingest.get`. That query is still mounted
 * on the reader doing the deleting, and invalidating it refetches the row that
 * was just deleted: the API throws for a missing id, the app's QueryClient
 * carries no retry defaults so it retries three times with backoff, and because
 * react-query awaits a promise returned from `onSuccess`, `mutateAsync` would
 * not settle until that finished — leaving the caller stuck for seconds on an
 * item now rendering as an error. The dead entry is dropped from the cache
 * instead, which needs no request.
 */
export function useDeleteItem() {
  const utils = trpc.useUtils();

  const remove = trpc.ingest.delete.useMutation({
    onSuccess: async (_result, variables) => {
      utils.ingest.get.reset({ id: variables.id });
      await Promise.all([
        utils.ingest.list.invalidate(),
        utils.crawl.list.invalidate(),
        utils.crawl.get.invalidate(),
      ]);
    },
  });

  const deleteItem = useCallback(
    async (itemId: number) => remove.mutateAsync({ id: itemId }),
    [remove],
  );

  return { deleteItem, isDeleting: remove.isPending };
}
