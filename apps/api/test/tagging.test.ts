import { describe, expect, test } from "bun:test";
import { JevClient } from "../src/lib/jev";
import {
  buildArticleState,
  buildTagQuestion,
  MAX_SUGGESTIONS,
  SUGGESTION_FLOOR,
  scoreTags,
  TAGS_PER_REQUEST,
  type TagRow,
} from "../src/modules/tagging/service";

type DecisionsBody = {
  questions: Record<
    string,
    { criteria: Record<string, string>; instructions: string; type: string }
  >;
  state: { article: { text: string; title: string; truncated: boolean } };
};

function tag(
  id: number,
  name: string,
  description: string | null = null,
): TagRow {
  return { description, id, name };
}

/**
 * A toy Jev: a tag is likely when its name appears in the article text, which
 * makes the scoring, ordering and threshold observable without a live call.
 */
function fakeJev(scoreFor?: (name: string) => number) {
  const requests: DecisionsBody[] = [];
  const fetcher = async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as DecisionsBody;
    requests.push(body);
    const answers = Object.fromEntries(
      Object.entries(body.questions).map(([key, question]) => {
        const name = question.instructions.match(/tag "([^"]+)"/)?.[1] ?? "";
        const score = scoreFor
          ? scoreFor(name)
          : body.state.article.text.includes(name)
            ? 0.9
            : 0.1;
        return [key, { noul: score, type: "noul" }];
      }),
    );
    return new Response(
      JSON.stringify({ answers, model: "typesafe/jev-1.13-20260917" }),
      { headers: { "Content-Type": "application/json" }, status: 200 },
    );
  };
  return { fetcher, requests };
}

const article = buildArticleState({
  contentMarkdown: "A long piece about postgres and search ranking.",
  contentText: null,
  title: "Why we moved off full-text search",
});

describe("buildArticleState", () => {
  test("prefers markdown, and says when the body was cut", () => {
    const long = buildArticleState({
      contentMarkdown: "x".repeat(20_000),
      contentText: "ignored",
      title: null,
    });
    expect(long.truncated).toBe(true);
    expect(long.text.length).toBeLessThan(20_000);

    expect(
      buildArticleState({
        contentMarkdown: null,
        contentText: "fallback",
        title: "T",
      }),
    ).toEqual({ text: "fallback", title: "T", truncated: false });
  });
});

describe("buildTagQuestion", () => {
  test("uses the tag's description as what the tag means", () => {
    const described = buildTagQuestion(
      tag(1, "rust", "The programming language"),
    );
    expect(described.type).toBe("noul");
    expect(described.instructions).toContain('tag "rust"');
    expect(described.instructions).toContain('"""The programming language"""');

    expect(buildTagQuestion(tag(2, "rust")).instructions).toContain(
      "judge it by its name alone",
    );
  });
});

describe("scoreTags", () => {
  test("keeps confident tags, most confident first, and drops the rest", async () => {
    const jev = fakeJev((name) =>
      name === "search" ? 0.95 : name === "postgres" ? 0.8 : 0.2,
    );
    const result = await scoreTags(
      new JevClient("test-key", jev.fetcher, "Tag suggestions"),
      article,
      [tag(1, "postgres"), tag(2, "recipes"), tag(3, "search")],
    );

    expect(result.model).toBe("typesafe/jev-1.13-20260917");
    expect(result.suggestions).toEqual([
      { confidence: 0.95, description: null, id: 3, name: "search" },
      { confidence: 0.8, description: null, id: 1, name: "postgres" },
    ]);
    // One request for the article, however many tags are weighed against it.
    expect(jev.requests).toHaveLength(1);
    expect(jev.requests[0]?.state.article.title).toBe(
      "Why we moved off full-text search",
    );
  });

  test("drops anything on the wrong side of the floor", async () => {
    const jev = fakeJev(() => SUGGESTION_FLOOR - 0.01);
    const result = await scoreTags(
      new JevClient("test-key", jev.fetcher),
      article,
      [tag(1, "postgres")],
    );

    expect(result.suggestions).toEqual([]);
  });

  test("splits a large library across requests and caps what comes back", async () => {
    const jev = fakeJev(() => 0.9);
    const tags = Array.from({ length: TAGS_PER_REQUEST + 5 }, (_, i) =>
      tag(i + 1, `tag-${i}`),
    );
    const result = await scoreTags(
      new JevClient("test-key", jev.fetcher),
      article,
      tags,
    );

    expect(jev.requests).toHaveLength(2);
    expect(result.suggestions).toHaveLength(MAX_SUGGESTIONS);
  });
});
