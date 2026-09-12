import type { BatchResult, IngestItem } from "./api";
import type { HnFavorite, HnFavoriteKind } from "./hn-favorites";

export const INGEST_MESSAGE = "nabit:ingest";

export interface IngestMessage {
  items: IngestItem[];
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
  return message.type === INGEST_MESSAGE && Array.isArray(message.items);
}

/** Hands a batch to the background worker and waits for its verdict. */
export async function sendIngestMessage(
  items: IngestItem[],
): Promise<IngestReply> {
  const message: IngestMessage = { items, type: INGEST_MESSAGE };
  return (await browser.runtime.sendMessage(message)) as IngestReply;
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
  return (await browser.runtime.sendMessage(message)) as HnFavoritesReply;
}
