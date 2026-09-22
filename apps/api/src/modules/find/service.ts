import type { TrpcServices } from "@repo/trpc";
import { TRPCError } from "@trpc/server";
import type { AppEnv } from "../../lib/config/env";
import {
  batchBySize,
  type ChoiceQuestion,
  JEV_MODEL,
  JevClient,
  type JevFetcher,
  mapConcurrent,
  UNTRUSTED_NOTE,
} from "../../lib/jev";
import type { UsageService } from "../usage/service";

type FindServiceContract = TrpcServices["find"];
type FindSearchInput = Parameters<FindServiceContract["search"]>[0];
type Actor = Parameters<FindServiceContract["search"]>[1];
type FindSearchOutput = Awaited<ReturnType<FindServiceContract["search"]>>;
type FindMatch = FindSearchOutput["matches"][number];

// Each passage travels inside its own question, never as `passages[i]` in the
// state: measured against Jev 1.13, positional references were judged against
// the wrong passage about half the time.
export const SCREEN_BATCH_PASSAGES = 16;
// Past this the article is searched only from the top, and the reader says so.
export const MAX_SCREEN_BATCHES = 40;
export const MAX_FIND_MATCHES = 20;
// A passage split finer than this is highlighted whole; one option per
// sentence, and a question may carry at most 255.
const MAX_EXCERPT_SENTENCES = 60;

export class FindService implements FindServiceContract {
  constructor(
    private readonly env: AppEnv,
    private readonly usage?: UsageService,
    private readonly fetcher?: JevFetcher,
  ) {}

  async search(
    input: FindSearchInput,
    actor: Actor = { userId: null },
  ): Promise<FindSearchOutput> {
    const apiKey = this.env.openrouter.apiKey;
    if (!apiKey) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Find is not configured: set OPENROUTER_API_KEY on the API.",
      });
    }
    const jev = new JevClient(apiKey, this.fetcher, "Find", (call) =>
      this.usage?.record({
        completionTokens: call.completionTokens,
        costUsd: call.costUsd,
        durationMs: call.durationMs,
        errorMessage: call.error ?? null,
        feature: "find",
        generationId: call.generationId,
        model: call.model,
        promptTokens: call.promptTokens,
        status: call.error ? "error" : "success",
        totalTokens: call.totalTokens,
        userId: actor.userId,
      }),
    );

    const batches = batchPassages(input.passages);
    const screened = batches.slice(0, MAX_SCREEN_BATCHES);

    let model = JEV_MODEL;
    const screenResults = await mapConcurrent(screened, async (batch) => {
      const response = await jev.decide(
        { query: input.query },
        buildScreenQuestions(batch.map((index) => input.passages[index] ?? "")),
      );
      model = response.model;
      return batch.map((index, i) => ({
        answer: jev.readChoice(response.answers[`p${i}`], [
          "match",
          "irrelevant",
        ]),
        index,
      }));
    });

    const ranked = screenResults
      .flat()
      .filter(({ answer }) => answer.choice === "match")
      .map(({ answer, index }) => ({
        confidence: answer.probabilities.match ?? 0,
        passage: index,
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_FIND_MATCHES);

    const quotes = await this.pickExcerpts(
      jev,
      input.query,
      ranked.map((match) => match.passage),
      input.passages,
    );

    return {
      matches: ranked.map(
        (match): FindMatch => ({
          ...match,
          quote: quotes.get(match.passage) ?? null,
        }),
      ),
      model,
      truncated: screened.length < batches.length,
    };
  }

  /**
   * Narrows each match to its best sentence. The sentences are ours, cut
   * from the passage, so whatever Jev picks is verbatim by construction. A
   * failure here only costs the tighter highlight, never the match.
   */
  private async pickExcerpts(
    jev: JevClient,
    query: string,
    passageIndexes: number[],
    passages: string[],
  ): Promise<Map<number, string>> {
    const candidates = passageIndexes
      .map((index) => ({ index, sentences: splitSentences(passages[index]) }))
      .filter(
        ({ sentences }) =>
          sentences.length > 1 && sentences.length <= MAX_EXCERPT_SENTENCES,
      );

    const groups = batchBySize(
      candidates,
      (candidate) => candidate.sentences.join(" ").length,
      SCREEN_BATCH_PASSAGES,
    );
    const quotes = new Map<number, string>();

    await mapConcurrent(groups, async (group) => {
      try {
        const response = await jev.decide(
          { query },
          Object.fromEntries(
            group.map(({ sentences }, i) => [
              `e${i}`,
              buildExcerptQuestion(sentences),
            ]),
          ),
        );
        group.forEach(({ index, sentences }, i) => {
          const ids = [...sentences.keys()].map((n) => `s${n}`);
          const answer = jev.readChoice(response.answers[`e${i}`], [
            ...ids,
            "full",
          ]);
          const sentence = sentences[ids.indexOf(answer.choice)];
          if (sentence) quotes.set(index, sentence);
        });
      } catch {
        // Whole-passage highlights are still right, just less precise.
      }
    });

    return quotes;
  }
}

/**
 * Groups passage indexes into screening requests, in reading order. Empty
 * passages are skipped rather than sent: there is nothing to judge.
 */
export function batchPassages(passages: string[]): number[][] {
  const indexes = passages
    .map((text, index) => ({ index, text: text.trim() }))
    .filter(({ text }) => text.length > 0);
  return batchBySize(
    indexes,
    ({ text }) => text.length,
    SCREEN_BATCH_PASSAGES,
  ).map((batch) => batch.map(({ index }) => index));
}

// One question per passage, each judged on its own. Asking "which of these
// match" in a single question would force a winner even when none do.
export function buildScreenQuestions(
  texts: string[],
): Record<string, ChoiceQuestion> {
  return Object.fromEntries(
    texts.map((text, i) => [
      `p${i}`,
      {
        criteria: {
          irrelevant:
            "Unrelated to the query, or shares only words with it without being about what it asks.",
          match:
            "The passage contains what the query asks about or describes: the fact, explanation, instruction, or topic. Paraphrases count.",
        },
        instructions: `The user is searching an article by meaning. Does this passage from it match the query in state? ${UNTRUSTED_NOTE}\n\nPassage: """${text.trim()}"""`,
        type: "choice" as const,
      },
    ]),
  );
}

// The sentences are the options themselves, so the pick names its own text.
export function buildExcerptQuestion(sentences: string[]): ChoiceQuestion {
  const criteria: Record<string, string> = {};
  sentences.forEach((sentence, n) => {
    criteria[`s${n}`] = sentence;
  });
  criteria.full =
    "No single sentence carries the match; the whole passage does.";
  return {
    criteria,
    instructions: `This passage matches the query in state. Choose the one sentence of it that most directly carries what the query asks for. ${UNTRUSTED_NOTE}`,
    type: "choice",
  };
}

/** Sentences exactly as they appear in the passage, minus surrounding space. */
export function splitSentences(text: string | undefined): string[] {
  if (!text) return [];
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  return [...segmenter.segment(text)]
    .map(({ segment }) => segment.trim())
    .filter((segment) => segment.length > 0);
}
