import type { ExtractedComment } from "./ingestors";

/**
 * Non-destructive comment merging.
 *
 * A capture is a point-in-time view of a thread, not the thread itself. Reddit
 * pages its comment tree, re-sorts it every time it is asked, and replaces the
 * body of a deleted comment with `[deleted]`. So "this comment is not in the
 * bytes I just fetched" never means "this comment did not exist" — it means the
 * archive is the only place it still lives.
 *
 * Hence: rows are only ever inserted or updated, never deleted, and archived
 * text is never overwritten with a tombstone. What the merge does record is
 * *why* a row is no longer backed by the source, via two metadata markers.
 */

/** The columns the merge reads off an already-archived comment. */
export type StoredComment = {
  author: string | null;
  contentMarkdown: string | null;
  contentText: string;
  externalId: string | null;
  id: number;
  metadata: Record<string, unknown>;
  parentExternalId: string | null;
  path: string;
  sourceCreatedAt: Date | null;
};

/** A row the merge wants written. `id` is null for comments we have not seen. */
export type CommentWrite = {
  author: string | null;
  contentMarkdown: string | null;
  contentText: string;
  externalId: string | null;
  id: number | null;
  metadata: Record<string, unknown>;
  parentExternalId: string | null;
  path: string;
  sourceCreatedAt: Date | null;
};

export type CommentMergeStats = {
  /** Comments in this capture that we had never archived before. */
  appended: number;
  /** Archived comments this capture did not contain at all. */
  missing: number;
  /** Archived comments the source has started reporting as deleted. */
  removedAtSource: number;
  /** Comments that were already archived and changed (edit, score, position). */
  updated: number;
};

export type CommentMergePlan = {
  stats: CommentMergeStats;
  writes: CommentWrite[];
};

/** Set when a capture no longer lists a comment we had archived. */
export const MISSING_MARKER = "missingFromSourceAt";
/** Set when the source itself reports the comment as deleted or removed. */
export const REMOVED_MARKER = "removedFromSourceAt";

const TOMBSTONE = /^\[(deleted|removed)\]$/i;

const PATH_SEGMENT_WIDTH = 4;

/**
 * Label prefix for comments that survive only in the archive. `z` sorts after
 * the `n` labels a live capture produces, so an archived-only reply lands at
 * the end of its parent's children instead of colliding with a live one.
 */
const ARCHIVED_LABEL_PREFIX = "z";

function archivedLabel(index: number) {
  return `${ARCHIVED_LABEL_PREFIX}${String(index).padStart(PATH_SEGMENT_WIDTH, "0")}`;
}

function joinPath(parentPath: string | null, label: string) {
  return parentPath ? `${parentPath}.${label}` : label;
}

function isTombstoneText(text: string | null | undefined) {
  if (text === null || text === undefined) {
    return true;
  }
  const trimmed = text.trim();
  return trimmed.length === 0 || TOMBSTONE.test(trimmed);
}

/**
 * Both extractors fall back to `"[deleted]"` when the source hands them no
 * body, so a tombstone looks the same whether reddit blanked the text or HN
 * dropped it entirely.
 */
function isTombstone(comment: ExtractedComment) {
  return (
    isTombstoneText(comment.contentText) &&
    isTombstoneText(comment.contentMarkdown)
  );
}

/**
 * External ids are what actually identify a comment across captures. Paths are
 * positional and get rewritten every time the source re-sorts, so they are only
 * used as a key for the extractors that emit no id.
 */
function keyOf(comment: { externalId?: string | null; path: string }) {
  return comment.externalId
    ? `id:${comment.externalId}`
    : `path:${comment.path}`;
}

function mergeMetadata(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
) {
  const merged: Record<string, unknown> = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(incoming ?? {})) {
    // A deleted comment comes back with nulls where it used to carry a score
    // and a permalink. Keeping the archived value beats storing the absence.
    if (value === null || value === undefined) {
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function toDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function marker(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function isUnchanged(write: CommentWrite, existing: StoredComment) {
  return (
    write.author === existing.author &&
    write.contentMarkdown === existing.contentMarkdown &&
    write.contentText === existing.contentText &&
    write.parentExternalId === existing.parentExternalId &&
    write.path === existing.path &&
    (write.sourceCreatedAt?.getTime() ?? null) ===
      (existing.sourceCreatedAt?.getTime() ?? null) &&
    JSON.stringify(write.metadata) === JSON.stringify(existing.metadata)
  );
}

/**
 * Works out what to write so that a capture is folded into what is already
 * archived, without losing anything the capture happens not to contain.
 *
 * Pure so the rules are testable without a database; `IngestService` does the
 * I/O around it.
 */
export function planCommentMerge(input: {
  existing: StoredComment[];
  incoming: ExtractedComment[];
  now: Date;
}): CommentMergePlan {
  const nowIso = input.now.toISOString();
  const existingByKey = new Map<string, StoredComment>();
  for (const row of input.existing) {
    existingByKey.set(keyOf(row), row);
  }

  const writes: CommentWrite[] = [];
  const stats: CommentMergeStats = {
    appended: 0,
    missing: 0,
    removedAtSource: 0,
    updated: 0,
  };
  const captured = new Set<string>();
  // External id → the path the comment ends up at, so archived-only replies can
  // be re-hung underneath whichever parent the new tree gave them.
  const resolvedPaths = new Map<string, string>();

  for (const comment of input.incoming) {
    const key = keyOf(comment);
    // A malformed capture can list the same comment twice. Taking the first
    // one keeps the write batch free of self-conflicts.
    if (captured.has(key)) {
      continue;
    }
    captured.add(key);

    const previous = existingByKey.get(key) ?? null;
    const tombstoned = isTombstone(comment);
    // The whole point: once we have the text, a later `[deleted]` does not
    // take it away.
    const keepArchived =
      previous !== null && tombstoned && !isTombstoneText(previous.contentText);

    const metadata = mergeMetadata(previous?.metadata, comment.metadata);
    // It is in this capture, so whatever made it look absent is over.
    delete metadata[MISSING_MARKER];
    if (tombstoned) {
      const alreadyRemoved = marker(previous?.metadata, REMOVED_MARKER);
      metadata[REMOVED_MARKER] = alreadyRemoved ?? nowIso;
      if (!alreadyRemoved) {
        stats.removedAtSource += 1;
      }
    } else {
      // Reddit un-deletes happen (a mod approves a removed comment).
      delete metadata[REMOVED_MARKER];
    }

    const write: CommentWrite = {
      author: keepArchived ? previous.author : (comment.author ?? null),
      contentMarkdown: keepArchived
        ? previous.contentMarkdown
        : (comment.contentMarkdown ?? null),
      contentText: keepArchived ? previous.contentText : comment.contentText,
      externalId: comment.externalId ?? previous?.externalId ?? null,
      id: previous?.id ?? null,
      metadata,
      parentExternalId: comment.parentExternalId ?? null,
      path: comment.path,
      sourceCreatedAt: keepArchived
        ? previous.sourceCreatedAt
        : toDate(comment.sourceCreatedAt),
    };

    if (write.externalId) {
      resolvedPaths.set(write.externalId, write.path);
    }

    if (!previous) {
      stats.appended += 1;
      writes.push(write);
    } else if (!isUnchanged(write, previous)) {
      stats.updated += 1;
      writes.push(write);
    }
  }

  // Sorting by the archived path means a parent is always re-anchored before
  // its children, since its path is a prefix of theirs.
  const missing = input.existing
    .filter((row) => !captured.has(keyOf(row)))
    .sort((left, right) => left.path.localeCompare(right.path));

  const childCounts = new Map<string, number>();
  for (const row of missing) {
    stats.missing += 1;

    const parentPath = row.parentExternalId
      ? (resolvedPaths.get(row.parentExternalId) ?? null)
      : null;
    const bucket = parentPath ?? "";
    const nextIndex = (childCounts.get(bucket) ?? 0) + 1;
    childCounts.set(bucket, nextIndex);
    const path = joinPath(parentPath, archivedLabel(nextIndex));
    if (row.externalId) {
      resolvedPaths.set(row.externalId, path);
    }

    const metadata = { ...row.metadata };
    if (!marker(metadata, MISSING_MARKER)) {
      metadata[MISSING_MARKER] = nowIso;
    }

    const write: CommentWrite = { ...row, metadata, path };
    if (!isUnchanged(write, row)) {
      writes.push(write);
    }
  }

  return { stats, writes };
}
