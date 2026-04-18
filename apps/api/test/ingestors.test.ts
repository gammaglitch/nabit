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
});
