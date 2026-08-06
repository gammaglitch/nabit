import { describe, expect, test } from "bun:test";
import { getIngestor } from "../src/modules/ingest/ingestors";
import { reextractSnapshots } from "../src/modules/ingest/service";

const ARTICLE_BODY = `
  <html lang="en">
    <head><title>Handstand Drills</title></head>
    <body>
      <main>
        <article>
          <h1>Handstand Drills</h1>
          <p>This article has enough prose to be detected by readability and it needs to contain
            plenty of words so that the generic extractor grades the extraction as a success
            rather than a partial result under the new word-count thresholds.</p>
          <p>Watch the first corrective drill before attempting the full progression, because the
            setup matters far more than the number of repetitions you manage to grind out during
            any single training session in the gym.</p>
          <iframe src="https://www.youtube.com/embed/hILHqNzlZkc?version=3"></iframe>
          <p>
            Adding a third paragraph pushes the extracted text well past the success threshold
            and mirrors the kind of longer-form prose the generic ingestor is meant to archive
            in the MVP, with enough filler content to comfortably clear one hundred words of
            visible text after readability does its cleanup pass on the raw HTML input.
          </p>
        </article>
      </main>
    </body>
  </html>
`;

const url = "https://example.com/handstand-drills";

describe("reextractSnapshots", () => {
  test("re-runs the extractor over an archived snapshot without refetching", async () => {
    const { attempts, preferred, preferredSnapshotId } =
      await reextractSnapshots({
        ingestor: getIngestor("generic"),
        snapshots: [{ body: ARTICLE_BODY, contentType: "text/html", id: 41 }],
        url,
      });

    expect(attempts).toHaveLength(1);
    expect(attempts[0].snapshotId).toBe(41);
    expect(preferredSnapshotId).toBe(41);
    expect(preferred?.status).toBe("success");
    expect(preferred?.title).toBe("Handstand Drills");
    // The whole point of a re-extract: the current extractor runs over the old
    // bytes, so the embed fix reaches an item captured before it existed.
    expect(preferred?.contentMarkdown).toContain(
      "[Video (youtube.com)](https://www.youtube.com/watch?v=hILHqNzlZkc)",
    );
  });

  test("prefers the snapshot that extracts best, not the newest", async () => {
    const { preferred, preferredSnapshotId } = await reextractSnapshots({
      ingestor: getIngestor("generic"),
      snapshots: [
        { body: ARTICLE_BODY, contentType: "text/html", id: 10 },
        // A later browser capture that came back as an empty shell.
        {
          body: '<html><body><div id="root"></div></body></html>',
          contentType: "text/html",
          id: 11,
        },
      ],
      url,
    });

    expect(preferredSnapshotId).toBe(10);
    expect(preferred?.status).toBe("success");
  });

  test("records an attempt per snapshot so the history stays intact", async () => {
    const { attempts } = await reextractSnapshots({
      ingestor: getIngestor("generic"),
      snapshots: [
        { body: ARTICLE_BODY, contentType: "text/html", id: 10 },
        { body: "not html at all", contentType: "application/pdf", id: 11 },
      ],
      url,
    });

    expect(attempts.map((entry) => entry.snapshotId)).toEqual([10, 11]);
    expect(attempts[1].attempt.status).toBe("failed");
    expect(attempts[1].attempt.errorMessage).toContain(
      "Unsupported content type",
    );
  });

  test("reports failure rather than a winner when nothing extracts", async () => {
    const { preferred } = await reextractSnapshots({
      ingestor: getIngestor("generic"),
      snapshots: [
        { body: "not html at all", contentType: "application/pdf", id: 12 },
      ],
      url,
    });

    // `reextract` keys off this to leave the item's existing content alone.
    expect(preferred?.status).toBe("failed");
  });
});
