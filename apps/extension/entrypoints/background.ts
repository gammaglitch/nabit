import { ingestBatch } from "@/lib/api";
import type {
  CaptureThreadRequest,
  CaptureThreadResponse,
} from "@/lib/messages";
import { fetchRedditThread, parseRedditThreadUrl } from "@/lib/reddit";

async function captureRedditThread(
  rawUrl: string,
): Promise<CaptureThreadResponse> {
  const thread = parseRedditThreadUrl(rawUrl);
  if (!thread) {
    return { error: "Not a reddit thread URL", ok: false };
  }

  const payload = await fetchRedditThread(thread.url);
  const { results } = await ingestBatch([
    { ingestor: "reddit", payload, url: thread.url },
  ]);

  const result = results[0];
  if (!result) {
    return { error: "API queued nothing for this thread", ok: false };
  }

  return { ok: true, reused: result.reused };
}

export default defineBackground(() => {
  console.log("[Nabit] Background service worker started");

  chrome.runtime.onMessage.addListener(
    (message: CaptureThreadRequest, _sender, sendResponse) => {
      if (message?.type !== "capture-reddit-thread") {
        return;
      }

      // Run the capture here rather than in the popup: closing the popup tears
      // down its page, which would abort the fetch or the ingest POST midway.
      captureRedditThread(message.url)
        .then(sendResponse)
        .catch((error: unknown) => {
          sendResponse({
            error: error instanceof Error ? error.message : "Unknown error",
            ok: false,
          } satisfies CaptureThreadResponse);
        });

      // Keeps the message channel open for the async sendResponse above.
      return true;
    },
  );
});
