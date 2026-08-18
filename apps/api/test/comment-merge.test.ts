import { describe, expect, test } from "bun:test";
import {
  MISSING_MARKER,
  planCommentMerge,
  REMOVED_MARKER,
  type StoredComment,
} from "../src/modules/ingest/comment-merge";
import type { ExtractedComment } from "../src/modules/ingest/ingestors";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const NOW_ISO = NOW.toISOString();

function stored(overrides: Partial<StoredComment> = {}): StoredComment {
  return {
    author: "cassini",
    contentMarkdown: "The archived body.",
    contentText: "The archived body.",
    externalId: "c1",
    id: 1,
    metadata: { score: 12 },
    parentExternalId: null,
    path: "n0001",
    sourceCreatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function captured(overrides: Partial<ExtractedComment> = {}): ExtractedComment {
  return {
    author: "cassini",
    contentMarkdown: "The archived body.",
    contentText: "The archived body.",
    externalId: "c1",
    metadata: { score: 12 },
    parentExternalId: null,
    path: "n0001",
    sourceCreatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function byExternalId(writes: Array<{ externalId: string | null }>) {
  return new Map(writes.map((write) => [write.externalId, write]));
}

describe("planCommentMerge", () => {
  test("appends comments the source has grown since capture", () => {
    const { stats, writes } = planCommentMerge({
      existing: [stored()],
      incoming: [
        captured(),
        captured({
          author: "huygens",
          contentMarkdown: "Posted after we archived the thread.",
          contentText: "Posted after we archived the thread.",
          externalId: "c2",
          path: "n0002",
        }),
      ],
      now: NOW,
    });

    expect(stats.appended).toBe(1);
    expect(stats.updated).toBe(0);
    expect(stats.missing).toBe(0);
    // The unchanged comment is not rewritten, so a re-fetch of a quiet thread
    // is a no-op rather than a full-table update.
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ externalId: "c2", id: null });
  });

  test("keeps the archived text when the source now says [deleted]", () => {
    const { stats, writes } = planCommentMerge({
      existing: [stored()],
      incoming: [
        captured({
          author: "[deleted]",
          contentMarkdown: "[deleted]",
          contentText: "[deleted]",
          metadata: { score: null },
        }),
      ],
      now: NOW,
    });

    expect(stats.removedAtSource).toBe(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      author: "cassini",
      contentText: "The archived body.",
      id: 1,
    });
    // The score the comment had when it was still up survives the null the
    // deleted version reports.
    expect(writes[0].metadata).toEqual({
      score: 12,
      [REMOVED_MARKER]: NOW_ISO,
    });
  });

  test("does not re-stamp a comment that was already deleted", () => {
    const earlier = "2026-08-10T00:00:00.000Z";
    const { stats, writes } = planCommentMerge({
      existing: [
        stored({ metadata: { score: 12, [REMOVED_MARKER]: earlier } }),
      ],
      incoming: [
        captured({
          author: "[deleted]",
          contentMarkdown: "[deleted]",
          contentText: "[deleted]",
        }),
      ],
      now: NOW,
    });

    expect(stats.removedAtSource).toBe(0);
    expect(writes).toHaveLength(0);
  });

  test("takes the real body when a comment we only have a tombstone for comes back", () => {
    const { writes } = planCommentMerge({
      existing: [
        stored({
          contentMarkdown: "[deleted]",
          contentText: "[deleted]",
          metadata: { [REMOVED_MARKER]: "2026-08-10T00:00:00.000Z" },
        }),
      ],
      incoming: [captured()],
      now: NOW,
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].contentText).toBe("The archived body.");
    expect(writes[0].metadata).toEqual({ score: 12 });
  });

  test("keeps comments a capture did not list and marks them missing", () => {
    const { stats, writes } = planCommentMerge({
      existing: [stored(), stored({ externalId: "c2", id: 2, path: "n0002" })],
      // Reddit re-sorts and pages its comment tree, so a later capture can
      // simply not contain a comment that is still very much there.
      incoming: [captured({ externalId: "c2", path: "n0001" })],
      now: NOW,
    });

    expect(stats.missing).toBe(1);
    const written = byExternalId(writes);
    expect(written.get("c1")?.metadata).toEqual({
      score: 12,
      [MISSING_MARKER]: NOW_ISO,
    });
    // Nothing is deleted, ever.
    expect(writes.every((write) => write.contentText.length > 0)).toBe(true);
  });

  test("clears the missing marker when a comment shows up again", () => {
    const { writes } = planCommentMerge({
      existing: [
        stored({
          metadata: { score: 12, [MISSING_MARKER]: "2026-08-10T00:00:00.000Z" },
        }),
      ],
      incoming: [captured()],
      now: NOW,
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].metadata).toEqual({ score: 12 });
  });

  test("re-hangs an archived-only reply under wherever its parent moved to", () => {
    const { writes } = planCommentMerge({
      existing: [
        stored({ externalId: "parent", id: 1, path: "n0001" }),
        stored({
          externalId: "orphan",
          id: 2,
          parentExternalId: "parent",
          path: "n0001.n0001",
        }),
        stored({
          externalId: "grandchild",
          id: 3,
          parentExternalId: "orphan",
          path: "n0001.n0001.n0001",
        }),
      ],
      // The parent is still there but the capture sorted it third, and neither
      // of its replies came back.
      incoming: [captured({ externalId: "parent", path: "n0003" })],
      now: NOW,
    });

    const written = byExternalId(writes);
    // `z` labels sort after the `n` labels a live capture produces, so the
    // archived-only replies land at the end of their parent's children
    // instead of colliding with a comment that is still live.
    expect(written.get("orphan")?.path).toBe("n0003.z0001");
    expect(written.get("grandchild")?.path).toBe("n0003.z0001.z0001");
  });

  test("falls back to the root for an archived reply whose parent is gone", () => {
    const { writes } = planCommentMerge({
      existing: [
        stored({
          externalId: "orphan",
          id: 2,
          parentExternalId: "never-archived",
          path: "n0009.n0001",
        }),
      ],
      incoming: [captured({ externalId: "fresh", path: "n0001" })],
      now: NOW,
    });

    expect(byExternalId(writes).get("orphan")?.path).toBe("z0001");
  });

  test("ignores a duplicate comment in a malformed capture", () => {
    const { stats, writes } = planCommentMerge({
      existing: [],
      incoming: [
        captured({ externalId: "c1", path: "n0001" }),
        captured({ externalId: "c1", path: "n0002" }),
      ],
      now: NOW,
    });

    // Two rows with the same (item, external id) would break the upsert batch
    // as surely as they break the unique constraint.
    expect(stats.appended).toBe(1);
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("n0001");
  });

  test("records an edit and a score change on an existing comment", () => {
    const { stats, writes } = planCommentMerge({
      existing: [stored()],
      incoming: [
        captured({
          contentMarkdown: "The archived body. Edit: with a correction.",
          contentText: "The archived body. Edit: with a correction.",
          metadata: { score: 40 },
        }),
      ],
      now: NOW,
    });

    expect(stats.updated).toBe(1);
    expect(writes[0]).toMatchObject({
      contentText: "The archived body. Edit: with a correction.",
      id: 1,
    });
    expect(writes[0].metadata).toEqual({ score: 40 });
  });
});
