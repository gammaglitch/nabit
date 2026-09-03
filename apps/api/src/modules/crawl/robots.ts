// robots.txt parsing and caching for the crawler.
//
// A single archived URL is a user following a link. A crawl is automated
// traffic, and it should say so and take no for an answer — this repo already
// fights egress reputation (reddit 403s the host IP, which is why
// compose.vpn.yml tunnels the ingest worker), and getting a host to block us
// costs far more than the pages we would have skipped.
//
// Parsing is split from fetching so the matching rules — which are the fiddly
// part — are testable without a network.

export const CRAWLER_USER_AGENT = "nabit";

export type RobotsRules = {
  allow: string[];
  disallow: string[];
  /** From a Crawl-delay directive, in milliseconds. Null when unspecified. */
  crawlDelayMs: number | null;
};

export const ALLOW_ALL: RobotsRules = {
  allow: [],
  disallow: [],
  crawlDelayMs: null,
};

/**
 * Parse robots.txt, returning the rules that apply to `userAgent`.
 *
 * A named group wins over the `*` group, per the standard: if any group names
 * us, the wildcard group does not apply at all.
 */
export function parseRobots(text: string, userAgent: string): RobotsRules {
  const named: RobotsRules = { allow: [], disallow: [], crawlDelayMs: null };
  const wildcard: RobotsRules = { allow: [], disallow: [], crawlDelayMs: null };
  let matchedNamed = false;

  // Consecutive User-agent lines share one group of directives, so the agents
  // accumulate until the first directive line closes the header.
  let currentAgents: string[] = [];
  let inHeader = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!inHeader) {
        currentAgents = [];
        inHeader = true;
      }
      // A bare `User-agent:` is meaningless, and must not be recorded: an
      // empty token matches every crawler, which would make us adopt an empty
      // "named" group and discard the `*` rules the site actually wrote.
      if (value) currentAgents.push(value.toLowerCase());
      continue;
    }

    inHeader = false;
    const targets: RobotsRules[] = [];
    const ourAgent = userAgent.toLowerCase();
    for (const agent of currentAgents) {
      if (agent === "*") targets.push(wildcard);
      // Prefix match on the product token, per the standard. A substring test
      // would also match a group naming some unrelated agent that happens to
      // appear inside ours.
      else if (ourAgent.startsWith(agent)) {
        targets.push(named);
        matchedNamed = true;
      }
    }
    if (targets.length === 0) continue;

    for (const target of targets) {
      if (field === "disallow") {
        // "Disallow:" with an empty value means allow everything, and must not
        // be recorded as a zero-length prefix that matches every path.
        if (value) target.disallow.push(value);
      } else if (field === "allow") {
        if (value) target.allow.push(value);
      } else if (field === "crawl-delay") {
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) {
          target.crawlDelayMs = Math.round(seconds * 1000);
        }
      }
    }
  }

  return matchedNamed ? named : wildcard;
}

// robots.txt patterns are prefix matches with two wildcards: `*` for any run of
// characters and a trailing `$` to anchor the end.
function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

function longestMatch(patterns: string[], path: string): number {
  let longest = -1;
  for (const pattern of patterns) {
    try {
      if (patternToRegExp(pattern).test(path)) {
        longest = Math.max(longest, pattern.length);
      }
    } catch {
      // A malformed pattern is not worth failing a crawl over.
    }
  }
  return longest;
}

/**
 * Whether `pathname` (plus query) may be fetched under these rules.
 *
 * Ties go to Allow, and the longer pattern wins — the usual interpretation,
 * and the one that lets a site carve an exception out of a broad Disallow.
 */
export function isPathAllowed(rules: RobotsRules, pathWithQuery: string) {
  const disallowed = longestMatch(rules.disallow, pathWithQuery);
  if (disallowed < 0) return true;
  return longestMatch(rules.allow, pathWithQuery) >= disallowed;
}

type CacheEntry = { rules: RobotsRules; fetchedAt: number };

/**
 * Fetches and caches robots.txt per origin.
 *
 * Lives for the life of the worker process. A crawl of 200 pages on one host
 * therefore costs one robots.txt fetch, not 200.
 */
export class RobotsCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<RobotsRules>>();

  constructor(
    private readonly ttlMs = 60 * 60_000,
    private readonly userAgent = CRAWLER_USER_AGENT,
    private readonly now: () => number = Date.now,
  ) {}

  async rulesFor(url: string): Promise<RobotsRules> {
    const { origin } = new URL(url);
    const cached = this.entries.get(origin);
    if (cached && this.now() - cached.fetchedAt < this.ttlMs) {
      return cached.rules;
    }

    // Collapse the stampede: expanding a page queues many URLs on one host at
    // once, and they would otherwise each miss the cache simultaneously.
    const existing = this.inFlight.get(origin);
    if (existing) return existing;

    const pending = this.fetchRules(origin)
      .then((rules) => {
        this.entries.set(origin, { rules, fetchedAt: this.now() });
        return rules;
      })
      .finally(() => {
        this.inFlight.delete(origin);
      });

    this.inFlight.set(origin, pending);
    return pending;
  }

  async isAllowed(url: string): Promise<boolean> {
    const parsed = new URL(url);
    const rules = await this.rulesFor(url);
    return isPathAllowed(rules, `${parsed.pathname}${parsed.search}`);
  }

  private async fetchRules(origin: string): Promise<RobotsRules> {
    try {
      const response = await fetch(`${origin}/robots.txt`, {
        headers: { "User-Agent": `${this.userAgent}/0.1` },
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
      });
      // A missing or erroring robots.txt means no stated restrictions. Only a
      // 2xx body can narrow what we fetch.
      if (!response.ok) return ALLOW_ALL;
      return parseRobots(await response.text(), this.userAgent);
    } catch {
      return ALLOW_ALL;
    }
  }
}
