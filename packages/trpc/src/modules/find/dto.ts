import { z } from "zod";

// Bounds on what one search may send. The reader extracts passages from the
// rendered article, so these are generous for a long page but stop a runaway
// client from shipping a whole site in one request.
export const FIND_LIMITS = {
  maxPassageChars: 2_000,
  maxPassages: 2_000,
  maxQueryChars: 500,
} as const;

export const FindSearchInput = z.object({
  /**
   * The article as the reader rendered it, one entry per block (paragraph,
   * list item, heading…). Results point back into this list by index, so the
   * client can highlight exactly what the model picked.
   */
  passages: z
    .array(z.string().max(FIND_LIMITS.maxPassageChars))
    .min(1)
    .max(FIND_LIMITS.maxPassages),
  query: z.string().trim().min(1).max(FIND_LIMITS.maxQueryChars),
});

export const FindMatch = z.object({
  /** Index into the `passages` the client sent. */
  passage: z.number().int().min(0),
  /**
   * Jev's probability, 0–1, that the passage matches. Calibrated, so it can
   * be shown to the user as-is.
   */
  confidence: z.number().min(0).max(1),
  /**
   * The sentence inside the passage that carries the match, copied from the
   * passage itself. Null means "highlight the whole block".
   */
  quote: z.string().nullable(),
});

export const FindSearchOutput = z.object({
  /** Best match first. */
  matches: z.array(FindMatch),
  model: z.string(),
  /** True when the article was too long and only its start was searched. */
  truncated: z.boolean(),
});

export type FindSearchInputDTO = z.infer<typeof FindSearchInput>;
export type FindMatchDTO = z.infer<typeof FindMatch>;
export type FindSearchOutputDTO = z.infer<typeof FindSearchOutput>;
