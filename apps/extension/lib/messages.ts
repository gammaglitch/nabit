import type { BatchResult, IngestItem, IngestTags } from "./api";
import type { HnFavorite, HnFavoriteKind } from "./hn-favorites";

export const INGEST_MESSAGE = "nabit:ingest";

export interface IngestMessage {
  items: IngestItem[];
  tags: IngestTags;
  type: typeof INGEST_MESSAGE;
}

export type IngestReply =
  | { ok: true; result: BatchResult }
  | { ok: false; error: string };

export function isIngestMessage(value: unknown): value is IngestMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const message = value as Partial<IngestMessage>;
  return (
    message.type === INGEST_MESSAGE &&
    Array.isArray(message.items) &&
    Array.isArray(message.tags)
  );
}

/**
 * `browser.runtime.sendMessage` resolves `undefined` when no listener answered.
 * In practice that means the background worker is running older code than the
 * popup — the shape a stale `wxt dev` build takes, since the two are bundled
 * separately and the worker only picks up changes when the extension reloads.
 *
 * Left unchecked it surfaces at the call site as `Cannot read properties of
 * undefined (reading 'ok')`, which says nothing about the actual cause. Name it
 * instead.
 */
function requireReply<T>(reply: T | undefined, what: string): T {
  if (reply === undefined) {
    throw new Error(
      `No response from the background worker (${what}) — reload the extension`,
    );
  }

  return reply;
}

/** Hands a batch to the background worker and waits for its verdict. */
export async function sendIngestMessage(
  items: IngestItem[],
  tags: IngestTags = [],
): Promise<IngestReply> {
  const message: IngestMessage = { items, tags, type: INGEST_MESSAGE };
  return requireReply(
    (await browser.runtime.sendMessage(message)) as IngestReply | undefined,
    INGEST_MESSAGE,
  );
}

export const HN_FAVORITES_MESSAGE = "nabit:hn-favorites";

export interface HnFavoritesMessage {
  kind: HnFavoriteKind;
  type: typeof HN_FAVORITES_MESSAGE;
  username: string;
}

export type HnFavoritesReply =
  | { ok: true; favorites: HnFavorite[] }
  | { ok: false; error: string };

export function isHnFavoritesMessage(
  value: unknown,
): value is HnFavoritesMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const message = value as Partial<HnFavoritesMessage>;
  return (
    message.type === HN_FAVORITES_MESSAGE &&
    typeof message.username === "string" &&
    (message.kind === "submission" || message.kind === "comment")
  );
}

/**
 * Asks the background worker to walk the favorites pages. It runs there rather
 * than in the popup for two reasons: the walk outlives a closed popup, and
 * MV3's service worker is where the host permission is usable without a
 * content script.
 */
export async function sendHnFavoritesMessage(
  username: string,
  kind: HnFavoriteKind,
): Promise<HnFavoritesReply> {
  const message: HnFavoritesMessage = {
    kind,
    type: HN_FAVORITES_MESSAGE,
    username,
  };
  return requireReply(
    (await browser.runtime.sendMessage(message)) as
      | HnFavoritesReply
      | undefined,
    HN_FAVORITES_MESSAGE,
  );
}
