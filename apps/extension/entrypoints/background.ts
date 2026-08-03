import { ingestBatch } from "@/lib/api";
import { isIngestMessage } from "@/lib/messages";

export default defineBackground(() => {
  // sendResponse + `return true` is the one async pattern both Chrome and
  // Firefox honour; returning a promise only works in Firefox.
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isIngestMessage(message)) {
      return false;
    }

    ingestBatch(message.items)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error: unknown) => {
        sendResponse({
          error: error instanceof Error ? error.message : "Unknown error",
          ok: false,
        });
      });

    // Keeps the message channel open for the async sendResponse above.
    return true;
  });
});
