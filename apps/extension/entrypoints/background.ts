import { ingestBatch } from "@/lib/api";
import { setHnFavoritesCache } from "@/lib/config";
import { fetchAllFavorites } from "@/lib/hn-favorites";
import { isHnFavoritesMessage, isIngestMessage } from "@/lib/messages";

export default defineBackground(() => {
  // sendResponse + `return true` is the one async pattern both Chrome and
  // Firefox honour; returning a promise only works in Firefox.
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isIngestMessage(message)) {
      ingestBatch(message.items, message.tags)
        .then((result) => sendResponse({ ok: true, result }))
        .catch((error: unknown) => {
          sendResponse({
            error: error instanceof Error ? error.message : "Unknown error",
            ok: false,
          });
        });

      // Keeps the message channel open for the async sendResponse above.
      return true;
    }

    if (isHnFavoritesMessage(message)) {
      fetchAllFavorites({ kind: message.kind, username: message.username })
        .then(async (favorites) => {
          // Stored before replying so the list survives a popup that closed
          // while the walk was still running.
          await setHnFavoritesCache({
            favorites,
            fetchedAt: Date.now(),
            kind: message.kind,
            username: message.username,
          });
          sendResponse({ favorites, ok: true });
        })
        .catch((error: unknown) => {
          sendResponse({
            error: error instanceof Error ? error.message : "Unknown error",
            ok: false,
          });
        });

      return true;
    }

    return false;
  });
});
