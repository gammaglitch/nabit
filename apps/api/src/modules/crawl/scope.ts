// Pure link-scoping rules for a crawl: no database, no network, no clock.
// Every decision here is a function of the link, the crawl root, and the scope
// config, which is what makes the whole rule set cheap to test — and worth
// testing, because these rules are the only thing standing between "archive
// this handbook" and "archive the open web".

import { normalizeSourceUrl } from "@repo/ingestors";

export type CrawlScopeMode = "host" | "path";

export type CrawlScope = {
  mode: CrawlScopeMode;
  followExternal: boolean;
  /** Maximum depth of an *archived* page. The root is depth 0. */
  maxDepth: number;
  /** Required for mode 'path'; see resolvePathPrefix. */
  pathPrefix?: string | null;
  includePattern?: string | null;
  excludePattern?: string | null;
};

export type SkipReason =
  | "unparseable"
  | "unsupported-protocol"
  | "non-document"
  | "excluded"
  | "not-included"
  | "out-of-scope"
  | "max-depth";

export type LinkVerdict =
  /** In scope, and its own links will be harvested in turn. */
  | { follow: "expand"; url: string; depth: number; external: false }
  /** Archived, but never expanded. */
  | { follow: "leaf"; url: string; depth: number; external: boolean }
  | { follow: "skip"; reason: SkipReason };

// Things that are linked from prose constantly and are never an article. The
// generic extractor already short-circuits non-text/html captures to `failed`,
// so fetching these would spend page budget to store a guaranteed failure.
const NON_DOCUMENT_EXTENSIONS = new Set([
  "7z", "avi", "bmp", "bz2", "css", "csv", "dmg", "doc", "docx", "eot", "epub",
  "exe", "gif", "gz", "ico", "jpeg", "jpg", "js", "json", "mp3", "mp4", "mov",
  "odt", "ogg", "pdf", "png", "ppt", "pptx", "rar", "rss", "svg", "tar", "tgz",
  "ttf", "wav", "webm", "webp", "woff", "woff2", "xls", "xlsx", "xml", "zip",
]);

const FOLLOWABLE_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * The directory an in-scope URL must sit under, with its trailing slash.
 *
 * Must be given the URL as the user typed it, *before* normalizeSourceUrl:
 * normalization trims the trailing slash, and that slash is the only thing
 * distinguishing the directory `/guide/` from the page `/guide`.
 */
export function resolvePathPrefix(rawRootUrl: string): string {
  const { pathname } = new URL(rawRootUrl);
  if (pathname.endsWith("/")) return pathname;
  const lastSlash = pathname.lastIndexOf("/");
  return lastSlash < 0 ? "/" : pathname.slice(0, lastSlash + 1);
}

// `www.` is a hosting detail, not a different site: a docs page at
// www.site.com linking to site.com is linking to itself, and treating that as
// off-site would strand half a crawl. Only used for comparison — the URL we
// store and fetch keeps whatever host it came with.
function comparableHost(hostname: string): string {
  return hostname.replace(/^www\./, "");
}

function extensionOf(pathname: string): string | null {
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dot = lastSegment.lastIndexOf(".");
  if (dot <= 0) return null;
  return lastSegment.slice(dot + 1).toLowerCase();
}

function compilePattern(
  pattern: string | null | undefined,
  label: string,
): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(pattern);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Invalid ${label} pattern: ${detail}`);
  }
}

/**
 * Build the classifier once per crawl, then call it per link.
 *
 * Compiling the include/exclude patterns up front keeps a 500-link page from
 * rebuilding the same two regexes 500 times, and surfaces an unusable pattern
 * when the crawl is created rather than midway through it.
 */
export function createLinkClassifier(input: {
  rootUrl: string;
  scope: CrawlScope;
}) {
  const root = new URL(normalizeSourceUrl(input.rootUrl));
  const rootHost = comparableHost(root.hostname);
  const include = compilePattern(input.scope.includePattern, "include");
  const exclude = compilePattern(input.scope.excludePattern, "exclude");
  const prefix =
    input.scope.mode === "path"
      ? (input.scope.pathPrefix ?? resolvePathPrefix(root.toString()))
      : null;

  function inScope(candidate: URL): boolean {
    if (comparableHost(candidate.hostname) !== rootHost) return false;
    if (!prefix) return true;
    // The root itself counts even when it is a file rather than a directory:
    // /guide/intro does not start with /guide/intro/.
    if (candidate.pathname === root.pathname) return true;
    return candidate.pathname.startsWith(prefix);
  }

  return function classifyLink(rawUrl: string, parentDepth: number): LinkVerdict {
    let normalized: string;
    let candidate: URL;
    try {
      candidate = new URL(rawUrl);
      if (!FOLLOWABLE_PROTOCOLS.has(candidate.protocol)) {
        // mailto:, javascript:, tel:, data: — common in page chrome.
        return { follow: "skip", reason: "unsupported-protocol" };
      }
      normalized = normalizeSourceUrl(rawUrl);
      candidate = new URL(normalized);
    } catch {
      return { follow: "skip", reason: "unparseable" };
    }

    const extension = extensionOf(candidate.pathname);
    if (extension && NON_DOCUMENT_EXTENSIONS.has(extension)) {
      return { follow: "skip", reason: "non-document" };
    }

    if (exclude?.test(normalized)) {
      return { follow: "skip", reason: "excluded" };
    }
    if (include && !include.test(normalized)) {
      return { follow: "skip", reason: "not-included" };
    }

    const depth = parentDepth + 1;
    if (depth > input.scope.maxDepth) {
      return { follow: "skip", reason: "max-depth" };
    }

    if (!inScope(candidate)) {
      if (!input.scope.followExternal) {
        return { follow: "skip", reason: "out-of-scope" };
      }
      // One hop and stop. Expanding off-site pages is how a crawl of a
      // handbook turns into a crawl of everything the handbook cites, and
      // then everything *those* pages cite.
      return { follow: "leaf", url: normalized, depth, external: true };
    }

    // At the depth cap there is no point harvesting links we would only
    // discard, so an in-scope page landing on maxDepth is archived as a leaf.
    return depth === input.scope.maxDepth
      ? { follow: "leaf", url: normalized, depth, external: false }
      : { follow: "expand", url: normalized, depth, external: false };
  };
}
