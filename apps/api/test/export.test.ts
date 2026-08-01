import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  computeContentHash,
  type ExportArticle,
  type ExportComment,
  type ExportFrontmatter,
  renderArticleDocument,
  renderComments,
  renderFrontmatter,
  rewriteAssetUrls,
  slugify,
} from "../src/modules/export/markdown";
import { buildApp } from "../src/server";

function frontmatter(
  overrides: Partial<ExportFrontmatter> = {},
): ExportFrontmatter {
  return {
    nabitId: 123,
    sourceType: "hacker_news",
    title: "Show HN: I built a thing",
    author: "pg",
    sourceUrl: "https://news.ycombinator.com/item?id=99",
    externalId: "99",
    sourceCreatedAt: "2026-05-29T18:30:00.000Z",
    ingestedAt: "2026-05-30T10:00:00.000Z",
    contentUpdatedAt: "2026-05-30T10:05:00.000Z",
    commentCount: 0,
    tags: ["programming", "show-hn"],
    contentHash: "abc123",
    ...overrides,
  };
}

function comment(
  path: string,
  overrides: Partial<ExportComment> = {},
): ExportComment {
  return {
    author: "alice",
    path,
    sourceCreatedAt: "2026-05-29T19:00:00.000Z",
    contentMarkdown: "Body text.",
    contentText: "Body text.",
    ...overrides,
  };
}

describe("export markdown rendering", () => {
  test("frontmatter quotes special chars, omits null fields, stable order", () => {
    const yaml = renderFrontmatter(
      frontmatter({ author: null, title: "C++: a #1 language" }),
    );
    const lines = yaml.split("\n");

    expect(lines[0]).toBe("---");
    expect(lines[lines.length - 1]).toBe("---");
    // nabit_id is always first key.
    expect(lines[1]).toBe("nabit_id: 123");
    // Titles with ':' and '#' are double-quoted (valid YAML flow scalar).
    expect(yaml).toContain('title: "C++: a #1 language"');
    // Null author omitted.
    expect(yaml).not.toContain("author:");
    // Tags render as a YAML list (each value is a quoted flow scalar).
    expect(yaml).toContain('tags:\n  - "programming"\n  - "show-hn"');
  });

  test("comments nest by ltree path depth", () => {
    const rendered = renderComments([
      comment("1", { author: "a" }),
      comment("1.1", { author: "b" }),
      comment("1.1.1", { author: "c" }),
      comment("2", { author: "d" }),
    ]);

    expect(rendered).toContain("\n- **a**");
    expect(rendered).toContain("\n  - **b**");
    expect(rendered).toContain("\n    - **c**");
    expect(rendered).toContain("\n- **d**");
  });

  test("comments honor maxComments and fall back to contentText", () => {
    const rendered = renderComments(
      [
        comment("1", {
          author: "first",
          contentMarkdown: null,
          contentText: "plain body",
        }),
        comment("2", { author: "second" }),
        comment("3", { author: "third" }),
      ],
      { maxComments: 2 },
    );

    // Markdown body is null, so it falls back to contentText.
    expect(rendered).toContain("plain body");
    // Only the first two comments render; the third is dropped.
    expect(rendered).toContain("- **first**");
    expect(rendered).toContain("- **second**");
    expect(rendered).not.toContain("- **third**");
  });

  test("rewriteAssetUrls makes asset paths absolute, leaves external URLs", () => {
    const md = "![a](/assets/abc) and ![b](https://example.com/x.png)";
    const out = rewriteAssetUrls(md, "https://api.nabit.test/");
    expect(out).toContain("![a](https://api.nabit.test/assets/abc)");
    expect(out).toContain("![b](https://example.com/x.png)");
  });

  test("content hash is stable and changes when comment count changes", () => {
    const base = {
      contentMarkdown: "body",
      contentUpdatedAt: "2026-05-30T10:05:00.000Z",
      commentCount: 1,
    };
    expect(computeContentHash(base)).toBe(computeContentHash(base));
    expect(computeContentHash({ ...base, commentCount: 2 })).not.toBe(
      computeContentHash(base),
    );
  });

  test("slugify builds id-prefixed slug and handles empty title", () => {
    expect(slugify(5, "Show HN: Hi!")).toBe("5-show-hn-hi");
    expect(slugify(7, null)).toBe("7");
  });

  test("article document round-trips frontmatter and includes sections", () => {
    const article: ExportArticle = {
      frontmatter: frontmatter({ commentCount: 1 }),
      title: "Show HN: I built a thing",
      contentMarkdown: "Article body with ![img](/assets/sha).",
      contentText: null,
      comments: [comment("1", { author: "alice" })],
    };

    const doc = renderArticleDocument(article, {
      assetBaseUrl: "https://api.nabit.test",
      comments: true,
    });

    expect(doc.startsWith("---\n")).toBe(true);
    expect(doc).toContain("nabit_id: 123");
    expect(doc).toContain("# Show HN: I built a thing");
    expect(doc).toContain("https://api.nabit.test/assets/sha");
    expect(doc).toContain("## Comments");
    expect(doc).toContain("- **alice**");
  });
});

describe("export endpoints", () => {
  const previousEnv = {
    authRequired: process.env.AUTH_REQUIRED,
    databaseUrl: process.env.DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    websocketsEnabled: process.env.WEBSOCKETS_ENABLED,
  };

  beforeEach(() => {
    process.env.DATABASE_URL = "";
    process.env.SUPABASE_URL = "";
    process.env.WEBSOCKETS_ENABLED = "";
  });

  afterEach(() => {
    process.env.AUTH_REQUIRED = previousEnv.authRequired;
    process.env.DATABASE_URL = previousEnv.databaseUrl;
    process.env.SUPABASE_URL = previousEnv.supabaseUrl;
    process.env.WEBSOCKETS_ENABLED = previousEnv.websocketsEnabled;
  });

  test("requires authentication when AUTH_REQUIRED is on", async () => {
    process.env.AUTH_REQUIRED = "true";
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/export/articles",
      });
      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  test("rejects a non-numeric article id with 400", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/export/articles/not-a-number",
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  test("rejects a batch request with no ids", async () => {
    process.env.AUTH_REQUIRED = "false";
    const app = await buildApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/export/articles/batch",
      });
      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
