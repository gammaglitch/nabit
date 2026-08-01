import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import { assetsTable, itemAssetsTable } from "../../db/schema";

type Database = NonNullable<DatabaseState["db"]>;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 25 * 1024 * 1024;

export type StoredAsset = {
  id: number;
  sha256: string;
  contentType: string;
};

export class AssetService {
  constructor(
    private readonly database: DatabaseState,
    private readonly storageRoot: string,
  ) {}

  /**
   * Fetches `url`, hashes the bytes, and either inserts a new asset row +
   * writes the file to disk or returns the existing row if the hash matches
   * something already stored. Same image referenced from multiple articles
   * is downloaded once.
   */
  async downloadAndStore(
    url: string,
    options: { refererUrl?: string } = {},
  ): Promise<StoredAsset> {
    const db = requireDatabase(this.database);
    const parsed = new URL(url);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      throw new Error(`Unsupported asset protocol: ${parsed.protocol}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let bytes: Uint8Array;
    let contentType: string;
    try {
      const headers: Record<string, string> = { "User-Agent": "nabit/0.1" };
      if (options.refererUrl) {
        headers.Referer = options.refererUrl;
      }

      const response = await fetch(url, {
        headers,
        redirect: "follow",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Asset fetch failed for ${url}: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES) {
        throw new Error(
          `Asset too large for ${url}: ${buffer.byteLength} bytes`,
        );
      }
      bytes = new Uint8Array(buffer);
      contentType =
        response.headers.get("content-type")?.split(";")[0]?.trim() ||
        "application/octet-stream";
    } finally {
      clearTimeout(timeout);
    }

    const sha256 = createHash("sha256").update(bytes).digest("hex");

    const [existing] = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.sha256, sha256))
      .limit(1);
    if (existing) {
      return {
        id: existing.id,
        sha256: existing.sha256,
        contentType: existing.contentType,
      };
    }

    const storagePath = pathForSha256(sha256);
    const absolutePath = this.absolutePath(storagePath);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);

    const [inserted] = await db
      .insert(assetsTable)
      .values({
        sha256,
        contentType,
        byteSize: bytes.byteLength,
        sourceUrl: url,
        storagePath,
      })
      .onConflictDoNothing({ target: assetsTable.sha256 })
      .returning();
    if (inserted) {
      return {
        id: inserted.id,
        sha256: inserted.sha256,
        contentType: inserted.contentType,
      };
    }

    // A concurrent ingest just won the insert race — re-read the row.
    const [raced] = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.sha256, sha256))
      .limit(1);
    if (!raced) {
      throw new Error(`Asset row missing after race for ${sha256}`);
    }
    return {
      id: raced.id,
      sha256: raced.sha256,
      contentType: raced.contentType,
    };
  }

  async linkAssetsToItem(itemId: number, assetIds: number[]) {
    if (assetIds.length === 0) return;
    const db = requireDatabase(this.database);
    const unique = Array.from(new Set(assetIds));
    await db
      .insert(itemAssetsTable)
      .values(unique.map((assetId) => ({ itemId, assetId })))
      .onConflictDoNothing();
  }

  /**
   * Walks markdown for `![alt](url)` images, downloads each http(s) URL, and
   * rewrites the URL to `/assets/<sha256>`. Returns the rewritten markdown
   * along with the asset IDs that were collected. Failed downloads keep the
   * original URL — we'd rather link the original than lose the image.
   */
  async rewriteMarkdownImages(
    markdown: string,
    options: { baseUrl?: string } = {},
  ): Promise<{ markdown: string; assetIds: number[] }> {
    const matches = Array.from(markdown.matchAll(MARKDOWN_IMAGE_REGEX));
    if (matches.length === 0) {
      return { markdown, assetIds: [] };
    }

    const replacements = new Map<string, string>();
    const assetIds: number[] = [];

    for (const match of matches) {
      const rawUrl = match[2];
      if (!rawUrl || replacements.has(rawUrl)) continue;

      const resolved = resolveUrl(rawUrl, options.baseUrl);
      if (!resolved || !ALLOWED_PROTOCOLS.has(resolved.protocol)) continue;

      try {
        const stored = await this.downloadAndStore(resolved.toString(), {
          refererUrl: options.baseUrl,
        });
        replacements.set(rawUrl, `/assets/${stored.sha256}`);
        assetIds.push(stored.id);
      } catch (error) {
        console.warn(
          { error: errorMessage(error), url: resolved.toString() },
          "asset download failed, leaving original URL in markdown",
        );
      }
    }

    if (replacements.size === 0) {
      return { markdown, assetIds: [] };
    }

    const rewritten = markdown.replace(
      MARKDOWN_IMAGE_REGEX,
      (whole, alt, url, title) => {
        const replacement = replacements.get(url);
        if (!replacement) return whole;
        return title
          ? `![${alt}](${replacement} "${title}")`
          : `![${alt}](${replacement})`;
      },
    );

    return { markdown: rewritten, assetIds };
  }

  async getBySha256(sha256: string) {
    const db = requireDatabase(this.database);
    const [row] = await db
      .select()
      .from(assetsTable)
      .where(eq(assetsTable.sha256, sha256))
      .limit(1);
    if (!row) return null;
    return {
      ...row,
      absolutePath: this.absolutePath(row.storagePath),
    };
  }

  private absolutePath(storagePath: string) {
    return resolve(this.storageRoot, storagePath);
  }
}

function requireDatabase(database: DatabaseState): Database {
  if (!database.db) {
    throw new Error("Database not configured");
  }
  return database.db;
}

export function pathForSha256(sha256: string) {
  return join(sha256.slice(0, 2), sha256.slice(2, 4), sha256);
}

const MARKDOWN_IMAGE_REGEX =
  /!\[([^\]]*)\]\(([^()\s]+)(?:\s+"([^"]*)")?\)/g;

function resolveUrl(url: string, base?: string) {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
