import type { BatchResult, IngestItem } from "./api";

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
  return chrome.runtime.sendMessage<IngestMessage, IngestReply>(message);
}
