"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/react";

/**
 * Mutations for the site crawler.
 *
 * Starting a crawl only queues its root page — the fan-out happens on the
 * ingest worker — so the list is invalidated rather than waiting on anything,
 * and the polling in useCrawl/useCrawlList picks the progress up from there.
 */
export function useCrawls() {
  const utils = trpc.useUtils();

  const invalidate = useCallback(async () => {
    await Promise.all([
      utils.crawl.list.invalidate(),
      utils.ingest.list.invalidate(),
    ]);
  }, [utils]);

  const start = trpc.crawl.start.useMutation({ onSuccess: invalidate });
  const cancel = trpc.crawl.cancel.useMutation({
    onSuccess: async () => {
      await Promise.all([invalidate(), utils.crawl.get.invalidate()]);
    },
  });
  const remove = trpc.crawl.delete.useMutation({ onSuccess: invalidate });

  return {
    cancelCrawl: useCallback(
      (id: number) => cancel.mutateAsync({ id }),
      [cancel],
    ),
    deleteCrawl: useCallback(
      (id: number, deleteItems: boolean) =>
        remove.mutateAsync({ deleteItems, id }),
      [remove],
    ),
    isCancelling: cancel.isPending,
    isDeleting: remove.isPending,
    isStarting: start.isPending,
    startCrawl: start.mutateAsync,
    startError: start.error?.message ?? null,
  };
}

// A crawl advances on the worker, one page at a time, so the browser has to
// poll to see it fill in. Fast while there is outstanding work, off entirely
// once the crawl has settled — mirrors the backoff in QueueStatus.
function refetchInterval(pagesQueued: number, status: string) {
  const active = status === "running" || status === "queued";
  if (!active) return false as const;
  return pagesQueued > 0 ? 2_000 : 5_000;
}

export function useCrawlList() {
  return trpc.crawl.list.useQuery(
    {},
    {
      refetchInterval: (query) => {
        const crawls = query.state.data?.crawls ?? [];
        const busy = crawls.some(
          (crawl) => crawl.status === "running" || crawl.status === "queued",
        );
        return busy ? 3_000 : false;
      },
    },
  );
}

export function useCrawl(id: number) {
  return trpc.crawl.get.useQuery(
    { id },
    {
      enabled: Number.isFinite(id) && id > 0,
      refetchInterval: (query) => {
        const crawl = query.state.data?.crawl;
        if (!crawl) return false as const;
        return refetchInterval(crawl.pagesQueued, crawl.status);
      },
    },
  );
}
