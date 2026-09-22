import { z } from "zod";

/** Which part of nabit made the call. */
export const LlmFeature = z.enum([
  "chat",
  "digest",
  "digest-summary",
  "find",
  "tag-run",
  "tag-suggest",
]);

export const UsageSummaryInput = z
  .object({
    /** How far back the summary reaches. */
    days: z.number().int().min(1).max(365).default(30),
  })
  .optional();

const FeatureSpend = z.object({
  calls: z.number(),
  /** Null when no call in the window was priced by the provider. */
  costUsd: z.number().nullable(),
  errors: z.number(),
  feature: z.string(),
  totalTokens: z.number(),
});

export const UsageSummaryOutput = z.object({
  /** Spend per day, oldest first, for the whole window. */
  byDay: z.array(z.object({ costUsd: z.number(), day: z.string() })),
  /** Biggest spender first. */
  byFeature: z.array(FeatureSpend),
  days: z.number(),
  /** The most recent calls, newest first. */
  recent: z.array(
    z.object({
      costUsd: z.number().nullable(),
      createdAt: z.string(),
      durationMs: z.number().nullable(),
      errorMessage: z.string().nullable(),
      feature: z.string(),
      id: z.number(),
      model: z.string(),
      status: z.string(),
      totalTokens: z.number().nullable(),
    }),
  ),
  totals: z.object({
    calls: z.number(),
    costUsd: z.number(),
    errors: z.number(),
  }),
});

export type UsageSummaryInputDTO = z.infer<typeof UsageSummaryInput>;
export type UsageSummaryOutputDTO = z.infer<typeof UsageSummaryOutput>;
export type LlmFeatureDTO = z.infer<typeof LlmFeature>;
