import { describe, expect, test } from "bun:test";
import type { AppEnv } from "../src/lib/config/env";
import { JEV_MODEL, JEV_STATE_CHARS, JevClient } from "../src/lib/jev";
import {
  batchPassages,
  FindService,
  MAX_SCREEN_BATCHES,
  SCREEN_BATCH_PASSAGES,
  splitSentences,
} from "../src/modules/find/service";

function makeEnv(apiKey: string | null = "test-key"): AppEnv {
  return {
    allowedEmails: null,
    apiToken: null,
    assetStoragePath: "./data/assets",
    authRequired: false,
    headlessBrowser: { captureUrl: null, enabled: false },
    host: "127.0.0.1",
    openrouter: { apiKey, enabled: apiKey !== null, model: "env/model" },
    port: 3001,
    supabase: {
      authEnabled: false,
      jwtAudience: ["authenticated"],
      jwtIssuer: null,
      jwksUrl: null,
      url: null,
    },
    websocketsEnabled: false,
  };
}

type DecisionsBody = {
  model: string;
  questions: Record<
    string,
    { criteria: Record<string, string>; instructions: string; type: string }
  >;
  state: { query: string };
};

function choice(picked: string, probabilities: Record<string, number>) {
  return { choice: picked, confidence: 0.9, probabilities, type: "choice" };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

/**
 * Stands in for OpenRouter's decisions endpoint with a toy Jev: a passage
 * matches when it mentions "battery", with a probability read off the text so
 * ranking is testable, and the excerpt pick is the sentence about hours.
 */
function fakeJev() {
  const requests: Array<{
    body: DecisionsBody;
    init: RequestInit;
    url: string;
  }> = [];
  const fetcher = async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as DecisionsBody;
    requests.push({ body, init, url });

    const answers = Object.fromEntries(
      Object.keys(body.questions).map((key) => {
        const question = body.questions[key];
        if (key.startsWith("p")) {
          const text = question?.instructions ?? "";
          const match = /battery/i.test(text)
            ? /strong/.test(text)
              ? 0.95
              : 0.7
            : 0.05;
          return [
            key,
            choice(match > 0.5 ? "match" : "irrelevant", {
              irrelevant: 1 - match,
              match,
            }),
          ];
        }
        const pick = Object.entries(question?.criteria ?? {}).find(
          ([option, text]) => option !== "full" && /hours/.test(text),
        );
        return [key, choice(pick?.[0] ?? "full", { full: 0.1, s0: 0.9 })];
      }),
    );
    return json({ answers, model: "typesafe/jev-1.13-20260917" });
  };
  return { fetcher, requests };
}

describe("batchPassages", () => {
  test("skips empty passages and keeps reading order", () => {
    expect(batchPassages(["a", "  ", "b", ""])).toEqual([[0, 2]]);
  });

  test("splits on passage count and on size", () => {
    const many = Array.from({ length: SCREEN_BATCH_PASSAGES + 1 }, () => "x");
    expect(batchPassages(many).map((batch) => batch.length)).toEqual([
      SCREEN_BATCH_PASSAGES,
      1,
    ]);

    const big = "y".repeat(JEV_STATE_CHARS / 2 + 1);
    expect(batchPassages([big, big, big])).toEqual([[0], [1], [2]]);
  });
});

describe("splitSentences", () => {
  test("returns sentences verbatim, so a pick is always a real quote", () => {
    const text = "It has a 70 Wh cell. It lasts eleven hours! Nice?";
    const sentences = splitSentences(text);

    expect(sentences).toEqual([
      "It has a 70 Wh cell.",
      "It lasts eleven hours!",
      "Nice?",
    ]);
    for (const sentence of sentences) expect(text).toContain(sentence);
  });
});

describe("JevClient answers", () => {
  const jev = new JevClient("test-key");

  test("rejects a choice outside the options it was asked", () => {
    expect(() =>
      jev.readChoice(choice("maybe", { maybe: 1 }), ["match", "irrelevant"]),
    ).toThrow("an option it was not offered");
    expect(() => jev.readChoice(undefined, ["match"])).toThrow();
  });

  test("reads a yes/no answer as the probability of true", () => {
    expect(jev.readNoul({ noul: 0.91, type: "noul" })).toBe(0.91);
    expect(() => jev.readNoul({ noul: true })).toThrow();
  });
});

describe("FindService.search", () => {
  test("screens every passage, ranks matches, and narrows each to a sentence", async () => {
    const jev = fakeJev();
    const service = new FindService(makeEnv(), undefined, jev.fetcher);

    const result = await service.search({
      passages: [
        "The keyboard is firm.",
        "Battery life is fine. It lasts eleven hours of browsing.",
        "",
        "The battery is strong.",
      ],
      query: "how long does it last",
    });

    expect(result).toEqual({
      matches: [
        { confidence: 0.95, passage: 3, quote: null },
        {
          confidence: 0.7,
          passage: 1,
          quote: "It lasts eleven hours of browsing.",
        },
      ],
      model: "typesafe/jev-1.13-20260917",
      truncated: false,
    });

    const [screen, excerpt] = jev.requests;
    expect(screen?.url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(new Headers(screen?.init.headers).get("Authorization")).toBe(
      "Bearer test-key",
    );
    expect(screen?.body.model).toBe(JEV_MODEL);
    // Each passage rides in its own question; the empty one is never sent.
    expect(screen?.body.state).toEqual({ query: "how long does it last" });
    expect(Object.keys(screen?.body.questions ?? {})).toEqual([
      "p0",
      "p1",
      "p2",
    ]);
    expect(screen?.body.questions.p1?.instructions).toContain(
      '"""Battery life is fine. It lasts eleven hours of browsing."""',
    );
    // Only the multi-sentence match needs narrowing.
    expect(Object.keys(excerpt?.body.questions ?? {})).toEqual(["e0"]);
    expect(excerpt?.body.questions.e0?.criteria).toMatchObject({
      s0: "Battery life is fine.",
      s1: "It lasts eleven hours of browsing.",
    });
    expect(jev.requests).toHaveLength(2);
  });

  test("searches only the start of an article too long to screen", async () => {
    const jev = fakeJev();
    const service = new FindService(makeEnv(), undefined, jev.fetcher);
    const passages = Array.from(
      { length: (MAX_SCREEN_BATCHES + 1) * SCREEN_BATCH_PASSAGES },
      (_, index) => `Passage ${index}.`,
    );

    const result = await service.search({ passages, query: "anything" });

    expect(result.truncated).toBe(true);
    expect(jev.requests).toHaveLength(MAX_SCREEN_BATCHES);
  });

  test("retries once when the endpoint fails", async () => {
    const jev = fakeJev();
    let calls = 0;
    const service = new FindService(makeEnv(), undefined, async (url, init) => {
      calls++;
      return calls === 1 ? json({}, 503) : jev.fetcher(url, init);
    });

    const result = await service.search({
      passages: ["The battery is strong."],
      query: "battery",
    });

    expect(calls).toBe(2);
    expect(result.matches).toHaveLength(1);
  });

  test("passes OpenRouter's own error message through", async () => {
    const service = new FindService(makeEnv(), undefined, async () =>
      json({ error: { code: 402, message: "Insufficient credits" } }, 402),
    );

    await expect(
      service.search({ passages: ["text"], query: "q" }),
    ).rejects.toThrow("Find failed: Insufficient credits");
  });

  test("keeps a match when narrowing it to a sentence fails", async () => {
    const jev = fakeJev();
    const service = new FindService(makeEnv(), undefined, async (url, init) => {
      const body = JSON.parse(String(init.body)) as DecisionsBody;
      return "e0" in body.questions
        ? json({ answers: {}, model: "m" })
        : jev.fetcher(url, init);
    });

    const result = await service.search({
      passages: ["Battery. It lasts eleven hours."],
      query: "battery",
    });

    expect(result.matches).toEqual([
      { confidence: 0.7, passage: 0, quote: null },
    ]);
  });

  test("refuses without an API key", async () => {
    const service = new FindService(
      makeEnv(null),
      undefined,
      fakeJev().fetcher,
    );

    await expect(
      service.search({ passages: ["text"], query: "q" }),
    ).rejects.toThrow("set OPENROUTER_API_KEY");
  });
});
