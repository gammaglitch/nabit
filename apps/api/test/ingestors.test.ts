import { describe, expect, test } from "bun:test";
import { getIngestor } from "../src/modules/ingest/ingestors";

describe("generic ingestor", () => {
  test("extracts article content from html snapshots", async () => {
    const generic = getIngestor("generic");
    const extraction = await generic.extract({
      snapshot: {
        body: `
          <html lang="en">
            <head>
              <title>Readable Example</title>
              <meta name="author" content="By Example" />
            </head>
            <body>
              <main>
                <article>
                  <h1>Readable Example</h1>
                  <p>This article has enough prose to be detected by readability and it needs to contain
                    plenty of words so that the generic extractor grades the extraction as a success
                    rather than a partial result under the new word-count thresholds.</p>
                  <p>It should come back as structured article content rather than a failed page shell,
                    carrying author metadata, a title, and a body that reads like something you would
                    actually want to archive and later read again inside your personal notes vault.</p>
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
        `,
        contentType: "text/html",
      },
      url: "https://example.com/readable",
    });

    expect(extraction.status).toBe("success");
    expect(extraction.sourceType).toBe("article");
    expect(extraction.title).toBe("Readable Example");
    expect(extraction.contentText).toContain("structured article content");
    expect(extraction.contentMarkdown).toBeTruthy();
    expect(extraction.contentMarkdown).toContain("structured article content");
    expect(extraction.contentMarkdown).toContain("\n\n");
  });

  test("preserves embedded videos as links in the extracted markdown", async () => {
    const generic = getIngestor("generic");
    const extraction = await generic.extract({
      snapshot: {
        body: `
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
                  <iframe class="youtube-player" width="560" height="315"
                    src="https://www.youtube.com/embed/hILHqNzlZkc?version=3&amp;rel=1&amp;showsearch=0"></iframe>
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
        `,
        contentType: "text/html",
      },
      url: "https://example.com/handstand-drills",
    });

    expect(extraction.status).toBe("success");
    expect(extraction.contentMarkdown).toContain(
      "[Video (youtube.com)](https://www.youtube.com/watch?v=hILHqNzlZkc)",
    );
  });
});

describe("generic ingestor identity", () => {
  test("declares every source type extraction can reclassify a page to", async () => {
    const generic = getIngestor("generic");
    const url = "https://example.com/readable";

    const identity = generic.identify({ snapshots: [], url });

    // The bug this guards: `identify` returned only "webpage", so re-archiving
    // a page that had already been promoted to "article" failed to match the
    // existing row, inserted a second one, and violated
    // uq_items_source_external as soon as extraction updated it.
    const extraction = await generic.extract({
      snapshot: {
        body: `
          <html lang="en">
            <head><title>Readable Example</title></head>
            <body>
              <main>
                <article>
                  <h1>Readable Example</h1>
                  <p>This article has enough prose to be detected by readability and it needs to contain
                    plenty of words so that the generic extractor grades the extraction as a success
                    rather than a partial result under the new word-count thresholds.</p>
                  <p>It should come back as structured article content rather than a failed page shell,
                    carrying author metadata, a title, and a body that reads like something you would
                    actually want to archive and later read again inside your personal notes vault.</p>
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
        `,
        contentType: "text/html",
      },
      url,
    });

    expect(extraction.sourceType).toBe("article");
    expect(identity.sourceTypeCandidates).toContain(identity.sourceType);
    expect(identity.sourceTypeCandidates).toContain(
      extraction.sourceType as string,
    );
  });

  test("declares the source type of a page too short to be an article", async () => {
    const generic = getIngestor("generic");
    const url = "https://example.com/stub";

    const identity = generic.identify({ snapshots: [], url });
    const extraction = await generic.extract({
      snapshot: {
        body: `<html lang="en"><head><title>Stub</title></head>
          <body><main><article><h1>Stub</h1><p>Too short.</p></article></main></body></html>`,
        contentType: "text/html",
      },
      url,
    });

    expect(extraction.sourceType).toBe("webpage");
    expect(identity.sourceTypeCandidates).toContain(
      extraction.sourceType as string,
    );
  });
});
