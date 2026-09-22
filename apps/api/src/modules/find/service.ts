import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { TrpcServices } from "@repo/trpc";
import { TRPCError } from "@trpc/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import type { AppEnv } from "../../lib/config/env";
import type { SettingsService } from "../settings/service";

type FindServiceContract = TrpcServices["find"];
type FindSearchInput = Parameters<FindServiceContract["search"]>[0];
type FindSearchOutput = Awaited<ReturnType<FindServiceContract["search"]>>;

// A find should feel close to instant; a model that has not answered by now is
// not going to produce something the user is still waiting for.
const MODEL_TIMEOUT_MS = 60_000;

// More than this is a list to read, not a set of places to jump between.
export const MAX_FIND_MATCHES = 20;

export const FIND_SYSTEM_PROMPT = `You are the find-in-page feature of nabit, a personal web archive. The user pressed cmd+f while reading an archived document and typed a query. Unlike a normal find, the query is matched by meaning, not by spelling: it can be a question, a paraphrase, a topic, or a description of something they remember reading.

The document is given as numbered passages, "[n] text", in reading order.

Return the passages that answer or best match the query, best match first:
- "passage" is the passage number n exactly as given.
- "quote" is the shortest span copied verbatim, character for character, from that passage that carries the match — usually one sentence or clause. Use "" when the whole passage is the match.
- "reason" is a few words on why it matches, written for the user (e.g. "defines the term", "gives the 2021 figure").

Prefer precision: return only passages that genuinely match, at most ${MAX_FIND_MATCHES}. Return an empty list when nothing in the document matches. Never invent passage numbers or text.`;

const ModelOutput = z.object({
  matches: z.array(
    z.object({
      passage: z.number().int(),
      quote: z.string(),
      reason: z.string(),
    }),
  ),
});

type ModelMatch = z.infer<typeof ModelOutput>["matches"][number];

export class FindService implements FindServiceContract {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly env: AppEnv,
  ) {}

  async search(input: FindSearchInput): Promise<FindSearchOutput> {
    const apiKey = this.env.openrouter.apiKey;
    if (!apiKey) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Semantic find is not configured: set OPENROUTER_API_KEY.",
      });
    }

    const settings = await this.settingsService.getChatSettings();
    const built = buildFindPrompt(input, settings.maxContextChars);
    const openrouter = createOpenRouter({ apiKey });

    let matches: ModelMatch[];
    try {
      const result = await generateText({
        abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
        instructions: FIND_SYSTEM_PROMPT,
        model: openrouter(settings.findModel),
        output: Output.object({ schema: ModelOutput }),
        prompt: built.prompt,
      });
      matches = result.output.matches;
    } catch (error) {
      // Surfaced as-is: the usual cause is a model slug OpenRouter does not
      // know, and the user can only fix that if they see the provider's words.
      throw new TRPCError({
        cause: error,
        code: "INTERNAL_SERVER_ERROR",
        message: `Find with ${settings.findModel} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }

    return {
      matches: verifyMatches(matches, input.passages, built.sentCount),
      model: settings.findModel,
      truncated: built.sentCount < input.passages.length,
    };
  }
}

/**
 * Numbers the passages the way the model is told to cite them, stopping once
 * the context budget is spent. Whole passages only, so a cited number always
 * refers to text the model actually saw.
 */
export function buildFindPrompt(
  input: FindSearchInput,
  maxContextChars: number,
): { prompt: string; sentCount: number } {
  const lines: string[] = [];
  let used = 0;
  for (const [index, passage] of input.passages.entries()) {
    const text = collapseWhitespace(passage);
    if (!text) continue;
    const line = `[${index}] ${text}`;
    if (used + line.length > maxContextChars && lines.length > 0) {
      return {
        prompt: renderPrompt(input.query, lines, true),
        sentCount: index,
      };
    }
    lines.push(line);
    used += line.length + 1;
  }

  return {
    prompt: renderPrompt(input.query, lines, false),
    sentCount: input.passages.length,
  };
}

function renderPrompt(query: string, lines: string[], truncated: boolean) {
  const note = truncated
    ? "\n\n(The document was cut off at a length limit; later passages are missing.)"
    : "";
  return `--- BEGIN DOCUMENT ---
${lines.join("\n")}
--- END DOCUMENT ---${note}

Query: ${query}`;
}

/**
 * The model's answer is checked against what was actually sent before any of
 * it reaches the reader: passage numbers must be in range and unique, and a
 * quote survives only if it really occurs in its passage. A quote that does
 * not is downgraded to "the whole passage" rather than dropped, since the
 * passage number itself is still a usable pointer.
 */
export function verifyMatches(
  matches: ModelMatch[],
  passages: string[],
  sentCount: number,
): FindSearchOutput["matches"] {
  const seen = new Set<number>();
  const verified: FindSearchOutput["matches"] = [];

  for (const match of matches) {
    const index = match.passage;
    if (!Number.isInteger(index) || index < 0 || index >= sentCount) continue;
    if (seen.has(index)) continue;
    const passage = passages[index];
    if (passage === undefined || !collapseWhitespace(passage)) continue;
    seen.add(index);

    const quote = collapseWhitespace(match.quote);
    verified.push({
      passage: index,
      quote:
        quote && normalize(passage).includes(normalize(quote)) ? quote : null,
      reason: match.reason.trim(),
    });
    if (verified.length >= MAX_FIND_MATCHES) break;
  }

  return verified;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalize(text: string): string {
  return collapseWhitespace(text).toLowerCase();
}
