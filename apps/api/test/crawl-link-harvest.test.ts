import { describe, expect, test } from "bun:test";
import { getIngestor } from "../src/modules/ingest/ingestors";

const generic = getIngestor("generic");

async function extract(body: string, url = "https://docs.site.com/guide/") {
  return generic.extract({
    snapshot: { body, contentType: "text/html" },
    url,
  });
}

describe("outbound link harvesting", () => {
  test("a nav-only table of contents still yields links, though it grades failed", async () => {
    // No prose at all — the whole page is the list. This is the page a crawl
    // exists to walk, and it is exactly what Readability throws away.
    const extraction = await extract(`
      <html lang="en">
        <head><title>Guide</title></head>
        <body>
          <nav>
            <ul>
              <li><a href="/guide/install">Install</a></li>
              <li><a href="/guide/config">Configure</a></li>
              <li><a href="https://other.com/spec">External spec</a></li>
            </ul>
          </nav>
        </body>
      </html>
    `);

    expect(extraction.status).toBe("failed");
    expect(extraction.outboundLinks).toEqual([
      "https://docs.site.com/guide/install",
      "https://docs.site.com/guide/config",
      "https://other.com/spec",
    ]);
  });

  test("relative hrefs resolve against the page url", async () => {
    const extraction = await extract(
      `<html><body><a href="../sibling">s</a><a href="deeper">d</a></body></html>`,
      "https://docs.site.com/guide/intro",
    );

    expect(extraction.outboundLinks).toEqual([
      "https://docs.site.com/sibling",
      "https://docs.site.com/guide/deeper",
    ]);
  });

  test("honours a document's own base href", async () => {
    const extraction = await extract(
      `<html><head><base href="https://cdn.site.com/v2/"></head>
       <body><a href="page">p</a></body></html>`,
    );

    expect(extraction.outboundLinks).toEqual(["https://cdn.site.com/v2/page"]);
  });

  test("deduplicates repeated links but keeps document order", async () => {
    const extraction = await extract(`
      <html><body>
        <a href="/b">b</a><a href="/a">a</a><a href="/b">b again</a>
      </body></html>
    `);

    expect(extraction.outboundLinks).toEqual([
      "https://docs.site.com/b",
      "https://docs.site.com/a",
    ]);
  });

  test("a real article carries its links alongside the prose", async () => {
    const extraction = await extract(`
      <html lang="en"><head><title>Real Article</title></head>
        <body><article>
          <h1>Real Article</h1>
          <p>This article has enough prose to be detected by readability and it needs to contain
            plenty of words so that the generic extractor grades the extraction as a success
            rather than a partial result under the word-count thresholds it applies.</p>
          <p>It should come back as structured article content rather than a failed page shell,
            carrying author metadata, a title, and a body that reads like something you would
            actually want to archive and later read again inside your personal notes vault.</p>
          <p>A third paragraph pushes the extracted text well past the success threshold and
            mirrors the kind of longer-form prose the generic ingestor is meant to archive, with
            enough filler to comfortably clear one hundred visible words after cleanup runs.</p>
          <p>See also <a href="/guide/next">the next chapter</a>.</p>
        </article></body>
      </html>
    `);

    expect(extraction.status).toBe("success");
    expect(extraction.outboundLinks).toContain("https://docs.site.com/guide/next");
  });

  test("a non-html capture has no links to offer", async () => {
    const extraction = await generic.extract({
      snapshot: { body: "%PDF-1.4", contentType: "application/pdf" },
      url: "https://docs.site.com/manual.pdf",
    });

    expect(extraction.status).toBe("failed");
    expect(extraction.outboundLinks).toBeUndefined();
  });
});
