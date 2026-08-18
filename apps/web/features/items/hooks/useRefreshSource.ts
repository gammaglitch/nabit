"use client";

import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/react";

export type RefreshStatus = "idle" | "queued" | "working" | "done" | "error";

/** How long a finished refresh stays reported before the button resets. */
const RESULT_VISIBLE_MS = 4000;

const POLL_MS = 2000;

/**
 * Queues a fresh capture of an item's source and waits for it.
 *
 * The capture runs on the ingest worker, so this is a job to watch rather than
 * a request to await — the mutation only hands back a job id. Once it lands,
 * the item and list queries are invalidated so the reader picks up whatever
 * grew (new comments, an updated body) without a reload.
 */
export function useRefreshSource() {
  const utils = trpc.useUtils();
  const [jobId, setJobId] = useState<number | null>(null);
  const [status, setStatus] = useState<RefreshStatus>("idle");

  const jobQuery = trpc.ingest.job.useQuery(
    { id: jobId ?? 0 },
    {
      enabled: jobId !== null,
      refetchInterval: (query) => {
        const jobStatus = query.state.data?.status;
        return jobStatus === "queued" || jobStatus === "processing"
          ? POLL_MS
          : false;
      },
    },
  );

  const jobStatus = jobQuery.data?.status ?? null;

  useEffect(() => {
    if (jobId === null || jobStatus === null) {
      return;
    }

    if (jobStatus === "queued") {
      setStatus("queued");
      return;
    }
    if (jobStatus === "processing") {
      setStatus("working");
      return;
    }

    // Terminal: stop polling and pull the item back in. A failed job leaves
    // the archived copy exactly as it was, so there is nothing to undo.
    setStatus(jobStatus === "success" ? "done" : "error");
    setJobId(null);
    void utils.ingest.get.invalidate();
    void utils.ingest.list.invalidate();
  }, [jobId, jobStatus, utils]);

  useEffect(() => {
    if (status !== "done" && status !== "error") {
      return;
    }
    const timer = setTimeout(() => setStatus("idle"), RESULT_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const refresh = trpc.ingest.refresh.useMutation({
    onError: () => setStatus("error"),
    onSuccess: async (result) => {
      setJobId(result.job.id);
      setStatus(result.job.status === "processing" ? "working" : "queued");
      await utils.ingest.jobs.invalidate();
    },
  });

  const refreshItem = useCallback(
    async (itemId: number) => {
      setStatus("queued");
      try {
        await refresh.mutateAsync({ id: itemId });
      } catch {
        // `onError` already reported it; the button reads `refreshStatus`.
      }
    },
    [refresh],
  );

  return {
    isRefreshing: status === "queued" || status === "working",
    refreshItem,
    refreshStatus: status,
  };
}
