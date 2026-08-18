import { describe, expect, test } from "bun:test";
import { RefreshInput, RefreshOutput } from "../src/modules/ingest/dto";

const job = {
  attempts: 0,
  createdAt: "2026-08-18T12:00:00.000Z",
  errorMessage: null,
  finishedAt: null,
  id: 77,
  ingestor: "reddit" as const,
  itemId: null,
  maxAttempts: 3,
  result: null,
  runAfter: "2026-08-18T12:00:00.000Z",
  status: "queued" as const,
  updatedAt: "2026-08-18T12:00:00.000Z",
  url: "https://reddit.com/r/rust/comments/abc123/a_thread",
};

describe("@repo/trpc refresh DTOs", () => {
  test("an item id is the whole request", () => {
    expect(RefreshInput.parse({ id: 7 })).toEqual({ id: 7 });
    expect(() => RefreshInput.parse({})).toThrow();
  });

  test("the output is a job to watch, not a finished capture", () => {
    // The fetch happens on the ingest worker, so nothing about the item can be
    // reported yet — a caller polls `ingest.job` with this id.
    const parsed = RefreshOutput.parse({ itemId: 7, job, reused: false });

    expect(parsed.job.status).toBe("queued");
    expect(parsed.job.itemId).toBeNull();
    expect(parsed.reused).toBe(false);
  });

  test("says when it piggybacked on a capture that was already in flight", () => {
    const parsed = RefreshOutput.parse({
      itemId: 7,
      job: { ...job, attempts: 1, status: "processing" },
      reused: true,
    });

    expect(parsed.reused).toBe(true);
  });
});
