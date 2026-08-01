import { describe, expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import type { DatabaseState } from "../src/db/client";
import {
  AssetService,
  pathForSha256,
  type StoredAsset,
} from "../src/modules/assets/service";

// These tests stay infra-free: no DB, no network. `rewriteMarkdownImages`
// never touches the database directly (only its call to `downloadAndStore`
// does), so we stub that method to exercise the markdown/regex/rewrite logic
// in isolation. The stub assigns a sequential id/sha per successful download
// so expected values are easy to predict (`hash1`, `hash2`, ...).
function makeService() {
  const downloaded: string[] = [];
  const service = new AssetService(
    { configured: false, db: null } satisfies DatabaseState,
    "/tmp/nabit-test-assets",
  );

  service.downloadAndStore = async (url: string): Promise<StoredAsset> => {
    downloaded.push(url);
    if (url.includes("boom")) {
      throw new Error("simulated download failure");
    }
    const n = downloaded.length;
    return { id: n, sha256: `hash${n}`, contentType: "image/png" };
  };

  return { service, downloaded };
}

describe("AssetService.pathForSha256", () => {
  test("shards by the first two byte-pairs of the hash", () => {
    const sha = "ab12cd34ef56".padEnd(64, "0");
    expect(pathForSha256(sha)).toBe(join("ab", "12", sha));
  });
});

describe("AssetService.rewriteMarkdownImages", () => {
  test("returns markdown untouched when there are no images", async () => {
    const { service, downloaded } = makeService();
    const result = await service.rewriteMarkdownImages("# hi\n\nno images here");
    expect(result.markdown).toBe("# hi\n\nno images here");
    expect(result.assetIds).toEqual([]);
    expect(downloaded).toHaveLength(0);
  });

  test("downloads an http image and rewrites it to /assets/<sha>", async () => {
    const { service, downloaded } = makeService();
    const result = await service.rewriteMarkdownImages(
      "![diagram](http://example.com/pipeline.png)",
    );
    expect(result.markdown).toBe("![diagram](/assets/hash1)");
    expect(result.assetIds).toEqual([1]);
    expect(downloaded).toEqual(["http://example.com/pipeline.png"]);
  });

  test("preserves the image title attribute", async () => {
    const { service } = makeService();
    const result = await service.rewriteMarkdownImages(
      '![alt](http://example.com/y.png "My Title")',
    );
    expect(result.markdown).toBe('![alt](/assets/hash1 "My Title")');
  });

  test("downloads a repeated URL only once but rewrites every occurrence", async () => {
    const { service, downloaded } = makeService();
    const md = "![a](http://x.test/p.png) then ![b](http://x.test/p.png)";
    const result = await service.rewriteMarkdownImages(md);
    expect(downloaded).toHaveLength(1);
    expect(result.assetIds).toEqual([1]);
    expect(result.markdown).toBe(
      "![a](/assets/hash1) then ![b](/assets/hash1)",
    );
  });

  test("resolves relative URLs against baseUrl, skips relative URLs without one", async () => {
    const withBase = makeService();
    const resolved = await withBase.service.rewriteMarkdownImages(
      "![a](images/x.png)",
      { baseUrl: "http://site.test/post/" },
    );
    expect(withBase.downloaded).toEqual(["http://site.test/post/images/x.png"]);
    expect(resolved.markdown).toBe("![a](/assets/hash1)");

    const noBase = makeService();
    const left = await noBase.service.rewriteMarkdownImages("![a](images/x.png)");
    expect(noBase.downloaded).toHaveLength(0);
    expect(left.markdown).toBe("![a](images/x.png)");
  });

  test("skips non-http(s) protocols like data: URIs", async () => {
    const { service, downloaded } = makeService();
    const md = "![a](data:image/png;base64,AAAA)";
    const result = await service.rewriteMarkdownImages(md);
    expect(downloaded).toHaveLength(0);
    expect(result.markdown).toBe(md);
    expect(result.assetIds).toEqual([]);
  });

  test("keeps the original URL when a download fails", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { service } = makeService();
      const md = "![a](http://x.test/boom.png) and ![b](http://x.test/ok.png)";
      const result = await service.rewriteMarkdownImages(md);
      // Failed image keeps its URL; the successful one is rewritten. The failed
      // download still advances the counter, so the next id/sha is 2.
      expect(result.markdown).toBe(
        "![a](http://x.test/boom.png) and ![b](/assets/hash2)",
      );
      expect(result.assetIds).toEqual([2]);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
