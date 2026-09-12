import { type IngestItem, ingestBatch } from "@/lib/api";
import { setHnFavoritesCache } from "@/lib/config";
import { fetchAllFavorites } from "@/lib/hn-favorites";
import { isHnFavoritesMessage, isIngestMessage } from "@/lib/messages";
import { fetchThreadJsonFromTab, parseRedditThreadUrl } from "@/lib/reddit";

/**
 * Replaces the payload of every reddit thread that still has its tab open with
 * the thread's `.json`, fetched from inside that tab.
 *
 * Reddit 403s `.json` for any unauthenticated client, so the server-side fetch
 * cannot get these bytes — only the user's own session can. Items that are not
 * reddit threads, or whose tab is gone (bookmarks, HN favorites), are passed
 * through untouched and left to the server, which keeps this from changing
 * anything about the other import paths.
 *
 * A thread whose capture fails is still sent, without a listing: the server
 * attempt will fail the job with reddit's own error, which is more use than
 * dropping the item silently. The reason is collected as a warning.
 */
async function enrichRedditItems(
  items: IngestItem[],
  tabIds: (number | null)[] | undefined,
): Promise<{ items: IngestItem[]; warnings: string[] }> {
  if (!tabIds?.some((id) => typeof id === "number")) {
    return { items, warnings: [] };
  }

  const warnings: string[] = [];
  const enriched = await Promise.all(
    items.map(async (item, index) => {
      const tabId = tabIds[index];
      const thread = parseRedditThreadUrl(item.url);
      if (typeof tabId !== "number" || !thread) {
        return item;
      }

      try {
        return {
          ...item,
          ingestor: "reddit" as const,
          // The raw response body. `stringifyPayload` on the API passes a string
          // through unchanged, so the stored snapshot is byte-for-byte what
          // reddit served this browser.
          payload: await fetchThreadJsonFromTab(tabId, thread),
          url: thread.url,
        };
      } catch (error) {
        warnings.push(
          `r/${thread.subreddit} ${thread.postId}: ${
            error instanceof Error ? error.message : "capture failed"
          }`,
        );
        return item;
      }
    }),
  );

  return { items: enriched, warnings };
}

export default defineBackground(() => {
  // sendResponse + `return true` is the one async pattern both Chrome and
  // Firefox honour; returning a promise only works in Firefox.
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isIngestMessage(message)) {
      enrichRedditItems(message.items, message.tabIds)
        .then(async ({ items, warnings }) => ({
          result: await ingestBatch(items, message.tags),
          warnings,
        }))
        .then(({ result, warnings }) =>
          sendResponse(
            warnings.length > 0
              ? { ok: true, result, warnings }
              : { ok: true, result },
          ),
        )
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
