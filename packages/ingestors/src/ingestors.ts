import type { ExtractedComment, Ingestor, IngestorName } from "./types";
import {
  fetchText,
  firstString,
  htmlToMarkdown,
  makePath,
  normalizeIsoDate,
  stripHtmlTags,
} from "./util";

const EXTRACTOR_VERSION = "0.1.0";

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "ref_url",
  "si",
]);

export function normalizeSourceUrl(input: string) {
  const url = new URL(input);

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  if (url.hostname === "twitter.com") {
    url.hostname = "x.com";
  }

  if (url.hostname === "www.reddit.com" || url.hostname === "old.reddit.com") {
    url.hostname = "reddit.com";
  }

  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }

  const keys = [...url.searchParams.keys()];
  for (const key of keys) {
    if (key.startsWith("utm_") || TRACKING_PARAMS.has(key)) {
      url.searchParams.delete(key);
    }
  }

  const sortedEntries = [...url.searchParams.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  );

  url.search = "";
  for (const [key, value] of sortedEntries) {
    url.searchParams.append(key, value);
  }

  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

export function resolveIngestorName(url: string, forced?: IngestorName | null) {
  if (forced) {
    return forced;
  }

  const normalized = new URL(url);
  const match = INGESTORS.find((ingestor) => ingestor.matches(normalized));
  return match?.name ?? "generic";
}

export function getIngestor(name: IngestorName) {
  const ingestor = INGESTORS.find((entry) => entry.name === name);
  if (!ingestor) {
    throw new Error(`Unknown ingestor: ${name}`);
  }
  return ingestor;
}

function stringifyPayload(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }

  return JSON.stringify(payload);
}

function parseJson<T>(body: string) {
  return JSON.parse(body) as T;
}

function getBestTweetText(tweet: Record<string, any>) {
  const noteText = tweet.note_tweet?.note_tweet_results?.result?.text;
  const legacyText = tweet.legacy?.full_text;
  const simpleText = tweet.text;

  const candidates = [noteText, legacyText, simpleText].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => right.length - left.length);
  return candidates[0];
}

function getTweetId(url: string, payload?: unknown) {
  if (payload && typeof payload === "object" && payload !== null) {
    const tweet = payload as Record<string, any>;
    const fromPayload = firstString(tweet.rest_id, tweet.legacy?.id_str);
    if (fromPayload) {
      return fromPayload;
    }
  }

  const match = new URL(url).pathname.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}

function getRedditPostId(url: string, body?: string) {
  if (body) {
    try {
      const payload = parseJson<any[]>(body);
      const fromPayload = firstString(
        payload?.[0]?.data?.children?.[0]?.data?.id,
        payload?.[0]?.data?.children?.[0]?.data?.name,
      );
      if (fromPayload) {
        return fromPayload.replace(/^t3_/, "");
      }
    } catch {
      // Ignore malformed capture bodies and fall back to the URL.
    }
  }

  const match = new URL(url).pathname.match(/\/comments\/([^/]+)/);
  return match?.[1] ?? null;
}

function getHackerNewsItemId(url: string, body?: string) {
  if (body) {
    try {
      const payload = parseJson<Record<string, unknown>>(body);
      const id = payload.id;
      if (typeof id === "number" || typeof id === "string") {
        return String(id);
      }
    } catch {
      // Ignore malformed capture bodies and fall back to the URL.
    }
  }

  return new URL(url).searchParams.get("id");
}

function buildRedditJsonUrl(url: string) {
  const parsed = new URL(url);
  const jsonUrl = new URL(parsed.toString());
  jsonUrl.pathname = `${parsed.pathname.replace(/\/+$/, "")}.json`;
  return jsonUrl.toString();
}

const HACKER_NEWS_OWN_HOSTS = new Set(["news.ycombinator.com"]);

const REDDIT_OWN_HOSTS = new Set([
  "i.redd.it",
  "old.reddit.com",
  "preview.redd.it",
  "redd.it",
  "reddit.com",
  "v.redd.it",
  "www.reddit.com",
]);

function isOffSiteUrl(
  candidate: string | null | undefined,
  ownHosts: Set<string>,
) {
  if (!candidate) {
    return false;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return !ownHosts.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function flattenRedditComments(
  entries: any[],
  parentExternalId: string | null,
  parentPath: string | null,
) {
  const comments: ExtractedComment[] = [];
  let index = 0;

  for (const entry of entries) {
    if (entry?.kind !== "t1") {
      continue;
    }

    index += 1;
    const data = entry.data ?? {};
    const path = makePath(parentPath, index);
    const body =
      firstString(data.body, data.body_html, "[deleted]") ?? "[deleted]";

    comments.push({
      author: firstString(data.author),
      contentText: stripHtmlTags(body) ?? body,
      externalId: firstString(data.id, data.name)?.replace(/^t1_/, "") ?? null,
      metadata: {
        permalink: firstString(data.permalink),
        score: typeof data.score === "number" ? data.score : null,
      },
      parentExternalId,
      path,
      sourceCreatedAt: normalizeIsoDate(
        typeof data.created_utc === "number" ? data.created_utc * 1000 : null,
      ),
    });

    const childEntries =
      data.replies?.data?.children && Array.isArray(data.replies.data.children)
        ? data.replies.data.children
        : [];

    comments.push(
      ...flattenRedditComments(
        childEntries,
        firstString(data.id, data.name)?.replace(/^t1_/, "") ?? null,
        path,
      ),
    );
  }

  return comments;
}

function flattenHackerNewsComments(
  entries: any[],
  parentExternalId: string | null,
  parentPath: string | null,
) {
  const comments: ExtractedComment[] = [];
  let index = 0;

  for (const entry of entries) {
    if (!entry) {
      continue;
    }

    index += 1;
    const path = makePath(parentPath, index);
    const externalId =
      typeof entry.id === "number" || typeof entry.id === "string"
        ? String(entry.id)
        : null;
    const contentText = stripHtmlTags(entry.text) ?? "[deleted]";

    comments.push({
      author: firstString(entry.author),
      contentText,
      externalId,
      metadata: {
        points: typeof entry.points === "number" ? entry.points : null,
        childrenCount: Array.isArray(entry.children)
          ? entry.children.length
          : 0,
      },
      parentExternalId,
      path,
      sourceCreatedAt: normalizeIsoDate(entry.created_at),
    });

    if (Array.isArray(entry.children) && entry.children.length > 0) {
      comments.push(
        ...flattenHackerNewsComments(entry.children, externalId, path),
      );
    }
  }

  return comments;
}

const tweetIngestor: Ingestor = {
  name: "tweet",
  matches(url) {
    return (
      /^(x|twitter)\.com$/i.test(url.hostname) &&
      /\/status\/\d+/.test(url.pathname)
    );
  },
  async capture({ payload, url }) {
    if (payload === undefined) {
      throw new Error(`Tweet ingest requires a payload for ${url}`);
    }

    return {
      snapshots: [
        {
          body: stringifyPayload(payload),
          contentType: "application/json",
        },
      ],
    };
  },
  identify({ payload, url }) {
    const tweetId = getTweetId(url, payload);
    if (!tweetId) {
      throw new Error(`Unable to resolve tweet id from ${url}`);
    }

    return {
      externalId: tweetId,
      sourceType: "tweet",
      sourceUrl: url,
    };
  },
  async extract({ snapshot, url }) {
    const tweet = parseJson<Record<string, any>>(snapshot.body);
    const legacy = tweet.legacy ?? {};
    const user = tweet.core?.user_results?.result ?? null;
    const userLegacy = user?.legacy ?? {};
    const userCore = user?.core ?? {};

    return {
      author: firstString(userCore.screen_name, userLegacy.screen_name),
      contentText: getBestTweetText(tweet),
      externalId: getTweetId(url, tweet),
      extractor: "tweet_json_v1",
      extractorVersion: EXTRACTOR_VERSION,
      metadata: {
        bookmarkCount:
          typeof legacy.bookmark_count === "number"
            ? legacy.bookmark_count
            : null,
        favoriteCount:
          typeof legacy.favorite_count === "number"
            ? legacy.favorite_count
            : null,
        media:
          legacy.extended_entities?.media?.map?.(
            (media: Record<string, any>) => ({
              mediaUrl: firstString(media.media_url_https, media.media_url),
              type: firstString(media.type),
            }),
          ) ?? [],
        quoteTweetId: firstString(tweet.quoted_status_result?.result?.rest_id),
        replyCount:
          typeof legacy.reply_count === "number" ? legacy.reply_count : null,
        retweetCount:
          typeof legacy.retweet_count === "number"
            ? legacy.retweet_count
            : null,
        userId: firstString(
          user?.rest_id,
          userLegacy.id_str,
          userLegacy.user_id_str,
        ),
        userName: firstString(userCore.name, userLegacy.name),
      },
      sourceCreatedAt: normalizeIsoDate(legacy.created_at),
      sourceType: "tweet",
      sourceUrl: url,
      status: "success",
      title: null,
    };
  },
};

const redditIngestor: Ingestor = {
  name: "reddit",
  matches(url) {
    return (
      url.hostname === "reddit.com" && /\/r\/.+\/comments\//.test(url.pathname)
    );
  },
  async capture({ url }) {
    const response = await fetchText(buildRedditJsonUrl(url), {
      headers: {
        "User-Agent": "nabit/0.1",
      },
    });

    return {
      snapshots: [
        {
          body: response.text,
          contentType: response.contentType,
        },
      ],
    };
  },
  identify({ snapshots, url }) {
    const postId = getRedditPostId(url, snapshots[0]?.body);
    if (!postId) {
      throw new Error(`Unable to resolve reddit post id from ${url}`);
    }

    return {
      externalId: postId,
      sourceType: "reddit_post",
      sourceUrl: url,
    };
  },
  async extract({ snapshot, url }) {
    const payload = parseJson<any[]>(snapshot.body);
    const post = payload?.[0]?.data?.children?.[0]?.data ?? {};
    const comments = Array.isArray(payload?.[1]?.data?.children)
      ? flattenRedditComments(payload[1].data.children, null, null)
      : [];

    const permalink = firstString(post.permalink);
    const sourceUrl = permalink
      ? normalizeSourceUrl(`https://reddit.com${permalink}`)
      : url;

    const linkedUrls: string[] = [];
    if (post.is_self !== true) {
      const postUrl = firstString(post.url_overridden_by_dest, post.url);
      if (isOffSiteUrl(postUrl, REDDIT_OWN_HOSTS)) {
        linkedUrls.push(postUrl as string);
      }
    }

    const selftext = firstString(post.selftext);
    return {
      author: firstString(post.author),
      comments,
      contentMarkdown: selftext,
      contentText: selftext,
      externalId: firstString(post.id, post.name)?.replace(/^t3_/, "") ?? null,
      extractor: "reddit_json",
      extractorVersion: EXTRACTOR_VERSION,
      linkedUrls,
      metadata: {
        numComments:
          typeof post.num_comments === "number"
            ? post.num_comments
            : comments.length,
        permalink,
        score: typeof post.score === "number" ? post.score : null,
        subreddit: firstString(post.subreddit),
      },
      sourceCreatedAt: normalizeIsoDate(
        typeof post.created_utc === "number" ? post.created_utc * 1000 : null,
      ),
      sourceType: "reddit_post",
      sourceUrl,
      status: "success",
      title: firstString(post.title),
    };
  },
};

const hackerNewsIngestor: Ingestor = {
  name: "hacker_news",
  matches(url) {
    return url.hostname === "news.ycombinator.com" && url.pathname === "/item";
  },
  async capture({ url }) {
    const itemId = getHackerNewsItemId(url);
    if (!itemId) {
      throw new Error(`Unable to resolve Hacker News item id from ${url}`);
    }

    const response = await fetchText(
      `https://hn.algolia.com/api/v1/items/${itemId}`,
      {
        headers: {
          "User-Agent": "nabit/0.1",
        },
      },
    );

    return {
      snapshots: [
        {
          body: response.text,
          contentType: response.contentType,
        },
      ],
    };
  },
  identify({ snapshots, url }) {
    const itemId = getHackerNewsItemId(url, snapshots[0]?.body);
    if (!itemId) {
      throw new Error(`Unable to resolve Hacker News item id from ${url}`);
    }

    return {
      externalId: itemId,
      sourceType: "hacker_news_post",
      sourceUrl: url,
    };
  },
  async extract({ snapshot, url }) {
    const post = parseJson<Record<string, any>>(snapshot.body);
    const comments = Array.isArray(post.children)
      ? flattenHackerNewsComments(post.children, null, null)
      : [];

    const linkedUrls: string[] = [];
    const postUrl = firstString(post.url);
    if (isOffSiteUrl(postUrl, HACKER_NEWS_OWN_HOSTS)) {
      linkedUrls.push(postUrl as string);
    }

    const postHtml = firstString(post.text);
    return {
      author: firstString(post.author),
      comments,
      contentMarkdown: htmlToMarkdown(postHtml),
      contentText: stripHtmlTags(postHtml) ?? null,
      externalId:
        typeof post.id === "number" || typeof post.id === "string"
          ? String(post.id)
          : null,
      extractor: "hn_algolia_json",
      extractorVersion: EXTRACTOR_VERSION,
      linkedUrls,
      metadata: {
        childrenCount: comments.length,
        points: typeof post.points === "number" ? post.points : null,
        type: firstString(post.type),
      },
      sourceCreatedAt: normalizeIsoDate(post.created_at),
      sourceType: "hacker_news_post",
      sourceUrl: url,
      status: "success",
      title: firstString(post.title),
    };
  },
};

/**
 * All browser-safe ingestors. The generic (JSDOM-based) ingestor lives
 * in the API since it depends on Node-only libraries.
 */
export const INGESTORS: Ingestor[] = [
  tweetIngestor,
  redditIngestor,
  hackerNewsIngestor,
];
