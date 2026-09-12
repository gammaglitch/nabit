import { describe, expect, test } from "bun:test";
import { buildThreadJsonUrl, parseRedditThreadUrl } from "../lib/reddit";

describe("parseRedditThreadUrl", () => {
  test("reads the subreddit and post id off a thread URL", () => {
    const thread = parseRedditThreadUrl(
      "https://www.reddit.com/r/typescript/comments/abc123/demo_thread/",
    );

    expect(thread).not.toBeNull();
    expect(thread?.postId).toBe("abc123");
    expect(thread?.subreddit).toBe("typescript");
  });

  test("accepts the apex, www and old hosts", () => {
    for (const host of ["reddit.com", "www.reddit.com", "old.reddit.com"]) {
      expect(
        parseRedditThreadUrl(`https://${host}/r/rust/comments/xyz789/title`)
          ?.postId,
      ).toBe("xyz789");
    }
  });

  test("truncates a comment permalink back to the thread root", () => {
    // `.json` on a permalink returns only that comment's subtree, so archiving
    // the permalink as given would capture a fragment and look complete.
    const thread = parseRedditThreadUrl(
      "https://www.reddit.com/r/rust/comments/xyz789/title/k1f2g3h/?context=3",
    );

    expect(thread?.url).toBe(
      "https://www.reddit.com/r/rust/comments/xyz789/title",
    );
  });

  test("drops the query string, including tracking params", () => {
    expect(
      parseRedditThreadUrl(
        "https://www.reddit.com/r/rust/comments/xyz789/title?utm_source=share",
      )?.url,
    ).toBe("https://www.reddit.com/r/rust/comments/xyz789/title");
  });

  test("rejects non-threads and look-alike hosts", () => {
    for (const url of [
      "https://www.reddit.com/r/rust/",
      "https://www.reddit.com/user/someone",
      "https://reddit.com.evil.test/r/rust/comments/xyz789/title",
      "https://news.ycombinator.com/item?id=1",
      "not a url",
      undefined,
      null,
    ]) {
      expect(parseRedditThreadUrl(url)).toBeNull();
    }
  });
});

describe("buildThreadJsonUrl", () => {
  test("appends .json and pins the representation", () => {
    // Must stay in step with `buildRedditJsonUrl` in @repo/ingestors — a client
    // capture and a server capture are only interchangeable if both ask reddit
    // for the same thing.
    expect(
      buildThreadJsonUrl("https://www.reddit.com/r/rust/comments/xyz789/title"),
    ).toBe(
      "https://www.reddit.com/r/rust/comments/xyz789/title.json?limit=500&raw_json=1",
    );
  });

  test("does not double up on a trailing slash", () => {
    expect(
      buildThreadJsonUrl(
        "https://www.reddit.com/r/rust/comments/xyz789/title/",
      ),
    ).toContain("/title.json?");
  });
});
