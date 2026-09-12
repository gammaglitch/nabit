import { describe, expect, test } from "bun:test";
import {
  decodeEntities,
  favoritesUrl,
  fetchAllFavorites,
  parseFavoritesPage,
  UnknownHnUserError,
} from "../lib/hn-favorites";

/**
 * The fixtures are hand-written, not captured from real accounts, but they
 * mirror HN's markup exactly — including the details that have bitten this
 * parser: single-quoted attributes on the "More" link, `&amp;`-escaped query
 * params, hex entities in titles, and self-posts whose `titleline` href is
 * relative.
 */
async function fixture(name: string): Promise<string> {
  return Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).text();
}

describe("favoritesUrl", () => {
  test("addresses each favorites list", () => {
    expect(favoritesUrl("archivist", "submission")).toBe(
      "https://news.ycombinator.com/favorites?id=archivist",
    );
    expect(favoritesUrl("archivist", "comment")).toBe(
      "https://news.ycombinator.com/favorites?id=archivist&comments=t",
    );
  });
});

describe("decodeEntities", () => {
  test("undoes the escaping HN applies to titles and comment bodies", () => {
    expect(decodeEntities("R&amp;D")).toBe("R&D");
    expect(decodeEntities("combinator&#x27;s")).toBe("combinator's");
    expect(decodeEntities("https:&#x2F;&#x2F;example.com")).toBe(
      "https://example.com",
    );
    expect(decodeEntities("128&nbsp;comments")).toBe("128 comments");
  });

  test("leaves anything it doesn't recognise alone", () => {
    expect(decodeEntities("100% & rising")).toBe("100% & rising");
    expect(decodeEntities("&notreal; &#x110000;")).toBe("&notreal; &#x110000;");
  });
});

describe("parseFavoritesPage", () => {
  test("reads favorited submissions", async () => {
    const page = parseFavoritesPage(
      await fixture("favorites-submissions.html"),
    );

    expect(page.nextUrl).toBeNull();
    expect(page.favorites).toHaveLength(2);

    expect(page.favorites[0]).toEqual({
      by: "alice",
      context: "https://example.com/posts/parser-combinators?a=1&b=2",
      createdAt: "2024-02-03T09:15:00.000000Z",
      id: "99100001",
      kind: "submission",
      title: "A parser combinator's guide to R&D",
      url: "https://news.ycombinator.com/item?id=99100001",
    });
  });

  test("treats a self-post's relative link as no outbound article", async () => {
    const page = parseFavoritesPage(
      await fixture("favorites-submissions.html"),
    );

    expect(page.favorites[1]).toMatchObject({
      by: "bob",
      context: null,
      id: "99100002",
      title: "Ask HN: How do you archive what you read?",
      url: "https://news.ycombinator.com/item?id=99100002",
    });
  });

  test("reads favorited comments, keyed by the comment's own id", async () => {
    const page = parseFavoritesPage(await fixture("favorites-comments.html"));

    expect(page.favorites).toHaveLength(2);
    expect(page.favorites[0]).toEqual({
      by: "carol",
      // The story the comment sits under, from the untruncated title attribute.
      context: "A parser combinator's guide to R&D",
      createdAt: "2024-05-02T11:20:08.000000Z",
      id: "99200001",
      kind: "comment",
      title:
        "The trick is to keep the index separate from the blobs. See https://example.com/notes for the layout I settled on.",
      // The comment id, not the story id — favoriting a comment archives the
      // comment's own subtree.
      url: "https://news.ycombinator.com/item?id=99200001",
    });
  });

  test("returns nothing for a user who has no favorites", async () => {
    const page = parseFavoritesPage(await fixture("favorites-empty.html"));

    expect(page.favorites).toEqual([]);
    expect(page.nextUrl).toBeNull();
  });

  test("follows the More cursor rather than the header's favorites links", async () => {
    const page = parseFavoritesPage(await fixture("favorites-paginated.html"));

    expect(page.favorites).toHaveLength(2);
    // Single-quoted href, `&amp;`-escaped params, resolved against the origin.
    expect(page.nextUrl).toBe(
      "https://news.ycombinator.com/favorites?id=archivist&next=99290001&n=31&time=1.740674471418734e9",
    );
  });
});

describe("fetchAllFavorites", () => {
  function fetcherFor(pages: Record<string, string>) {
    const requested: string[] = [];
    const fetchPage = async (url: string) => {
      requested.push(url);
      const html = pages[url];
      if (html === undefined) {
        throw new Error(`unexpected fetch: ${url}`);
      }
      return html;
    };
    return { fetchPage, requested };
  }

  test("walks every page and concatenates them", async () => {
    const first = await fixture("favorites-paginated.html");
    const last = await fixture("favorites-submissions.html");
    const nextUrl = parseFavoritesPage(first).nextUrl as string;

    const { fetchPage, requested } = fetcherFor({
      [favoritesUrl("archivist", "submission")]: first,
      [nextUrl]: last,
    });

    const progress: Array<{ pages: number; favorites: number }> = [];
    const favorites = await fetchAllFavorites({
      fetchPage,
      kind: "submission",
      onProgress: (update) => progress.push(update),
      pageDelayMs: 0,
      username: "archivist",
    });

    expect(requested).toEqual([
      favoritesUrl("archivist", "submission"),
      nextUrl,
    ]);
    expect(favorites.map((favorite) => favorite.id)).toEqual([
      "99300001",
      "99300002",
      "99100001",
      "99100002",
    ]);
    expect(progress).toEqual([
      { favorites: 2, pages: 1 },
      { favorites: 4, pages: 2 },
    ]);
  });

  test("stops when a cursor loops back on itself", async () => {
    // A page whose More link points at the page itself — the shape a stalled
    // cursor would take, and an infinite walk if nothing guarded it.
    const page = await fixture("favorites-paginated.html");
    const selfReferential = page.replace(
      "favorites?id=archivist&amp;next=99290001&amp;n=31&amp;time=1.740674471418734e9",
      "favorites?id=archivist",
    );

    const { fetchPage, requested } = fetcherFor({
      [favoritesUrl("archivist", "submission")]: selfReferential,
    });

    const favorites = await fetchAllFavorites({
      fetchPage,
      kind: "submission",
      pageDelayMs: 0,
      username: "archivist",
    });

    expect(requested).toHaveLength(1);
    expect(favorites).toHaveLength(2);
  });

  test("honours the page cap", async () => {
    const page = await fixture("favorites-paginated.html");
    let served = 0;

    const favorites = await fetchAllFavorites({
      // Every page hands back a fresh cursor and fresh ids, so only the cap
      // ends this walk.
      fetchPage: async () => {
        served += 1;
        return page
          .replace(/next=99290001/, `next=${99290001 - served}`)
          .replace(/id="99300001"/, `id="1400000${served}"`)
          .replace(/id="99300002"/, `id="1500000${served}"`);
      },
      kind: "submission",
      maxPages: 3,
      pageDelayMs: 0,
      username: "archivist",
    });

    expect(served).toBe(3);
    expect(favorites).toHaveLength(6);
  });

  test("reports an unknown username instead of an empty list", async () => {
    const attempt = fetchAllFavorites({
      // HN answers with this bare string and no markup at all.
      fetchPage: async () => "No such user.",
      kind: "submission",
      pageDelayMs: 0,
      username: "definitely-not-a-user",
    });

    await expect(attempt).rejects.toThrow(UnknownHnUserError);
  });

  test("refuses an empty username rather than fetching the whole site", async () => {
    const attempt = fetchAllFavorites({
      fetchPage: async () => {
        throw new Error("should not fetch");
      },
      kind: "submission",
      username: "   ",
    });

    await expect(attempt).rejects.toThrow("Enter a Hacker News username");
  });
});
