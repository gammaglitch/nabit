import { afterEach, describe, expect, test } from "bun:test";
import {
  HN_FAVORITES_MESSAGE,
  INGEST_MESSAGE,
  isHnFavoritesMessage,
  isIngestMessage,
  sendHnFavoritesMessage,
  sendIngestMessage,
} from "../lib/messages";

/**
 * The popup and the background worker are bundled separately, so a reloaded
 * popup can end up talking to a worker running older code — exactly what a
 * stale `wxt dev` build looks like. The worker's listener then matches nothing,
 * returns false, and `sendMessage` resolves undefined.
 */
function stubSendMessage(reply: unknown) {
  const sent: unknown[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: standing in for the WXT global
  (globalThis as any).browser = {
    runtime: {
      sendMessage: async (message: unknown) => {
        sent.push(message);
        return reply;
      },
    },
  };
  return sent;
}

afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: standing in for the WXT global
  (globalThis as any).browser = undefined;
});

describe("an unanswered message", () => {
  test("names the cause instead of throwing a TypeError", async () => {
    stubSendMessage(undefined);

    // Without the guard this is `Cannot read properties of undefined
    // (reading 'ok')` at the call site, which points nowhere near the worker.
    await expect(
      sendHnFavoritesMessage("someone", "submission"),
    ).rejects.toThrow(
      /No response from the background worker.*reload the extension/,
    );
  });

  test("covers the ingest path too", async () => {
    stubSendMessage(undefined);

    await expect(
      sendIngestMessage([{ url: "https://example.com" }]),
    ).rejects.toThrow(/No response from the background worker/);
  });

  test("passes a real reply straight through", async () => {
    stubSendMessage({ favorites: [], ok: true });

    expect(await sendHnFavoritesMessage("someone", "comment")).toEqual({
      favorites: [],
      ok: true,
    });
  });
});

describe("message guards", () => {
  test("recognise what the senders actually put on the wire", async () => {
    const sent = stubSendMessage({ ok: true });

    await sendHnFavoritesMessage("someone", "submission");
    await sendIngestMessage([{ url: "https://example.com" }], ["a tag"]);

    expect(isHnFavoritesMessage(sent[0])).toBe(true);
    expect(isIngestMessage(sent[1])).toBe(true);
    // Each guard must reject the other's message, or the first matching branch
    // in the worker would swallow it.
    expect(isIngestMessage(sent[0])).toBe(false);
    expect(isHnFavoritesMessage(sent[1])).toBe(false);
  });

  test("reject messages from a different sender entirely", () => {
    expect(isIngestMessage({ type: INGEST_MESSAGE })).toBe(false);
    expect(isHnFavoritesMessage({ type: HN_FAVORITES_MESSAGE })).toBe(false);
    expect(isIngestMessage(null)).toBe(false);
    expect(isHnFavoritesMessage("nope")).toBe(false);
  });
});
