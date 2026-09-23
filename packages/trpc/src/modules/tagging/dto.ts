import { z } from "zod";

export const SuggestTagsInput = z.object({
  itemId: z.number(),
});

export const SuggestTagsOutput = z.object({
  model: z.string(),
  /** True when the library has more tags than one round could weigh. */
  truncated: z.boolean(),
  /** Tags the item does not already carry, most confident first. */
  suggestions: z.array(
    z.object({
      /** Jev's probability, 0-1, that the tag belongs on this item. */
      confidence: z.number().min(0).max(1),
      description: z.string().nullable(),
      id: z.number(),
      name: z.string(),
    }),
  ),
});

/**
 * A bulk pass weighs the chosen tags against every item that lacks them.
 * `scoring` is the worker's; `scored` is waiting for the user to look at the
 * counts and apply or discard them.
 */
export const TagRunStatus = z.enum([
  "pending",
  "scoring",
  "scored",
  "applied",
  "failed",
  "cancelled",
]);

export const TagRunOutput = z.object({
  /** Rows written to item_tags, once applied. */
  appliedCount: z.number(),
  errorMessage: z.string().nullable(),
  /** Items the provider refused even after the retry pass. */
  failedCount: z.number(),
  finishedAt: z.string().nullable(),
  id: z.number(),
  itemsScored: z.number(),
  itemsTotal: z.number(),
  /** What the run would do, per tag, highest count first. */
  matches: z.array(
    z.object({
      count: z.number(),
      description: z.string().nullable(),
      tagId: z.number(),
      tagName: z.string(),
    }),
  ),
  model: z.string().nullable(),
  startedAt: z.string(),
  status: TagRunStatus,
});

export const StartTagRunInput = z.object({
  tagIds: z.array(z.number()).min(1).max(64),
});

export const TagRunIdInput = z.object({
  id: z.number(),
});

/** Null when the instance has never run one. */
export const LatestTagRunOutput = z.object({
  run: TagRunOutput.nullable(),
});

export const TagRunEstimateOutput = z.object({
  /** Items that lack at least one of the chosen tags. */
  itemsTotal: z.number(),
});

export type SuggestTagsInputDTO = z.infer<typeof SuggestTagsInput>;
export type SuggestTagsOutputDTO = z.infer<typeof SuggestTagsOutput>;
export type TagRunOutputDTO = z.infer<typeof TagRunOutput>;
export type TagRunStatusDTO = z.infer<typeof TagRunStatus>;
export type StartTagRunInputDTO = z.infer<typeof StartTagRunInput>;
export type TagRunIdInputDTO = z.infer<typeof TagRunIdInput>;
export type LatestTagRunOutputDTO = z.infer<typeof LatestTagRunOutput>;
export type TagRunEstimateOutputDTO = z.infer<typeof TagRunEstimateOutput>;
