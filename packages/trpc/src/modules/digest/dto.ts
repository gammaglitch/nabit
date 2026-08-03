import { z } from "zod";

export const DigestStatus = z.enum([
  "pending",
  "processing",
  "success",
  "failed",
  "empty",
]);

export const DigestOutput = z.object({
  id: z.number(),
  periodStart: z.string(),
  periodEnd: z.string(),
  // Rendered server-side in the instance's configured digest timezone. The
  // client must not re-derive this from the timestamps — it would format in
  // the browser's zone and disagree with the digest's own heading.
  periodLabel: z.string(),
  status: DigestStatus,
  itemCount: z.number().int().nonnegative(),
  // Items in the window whose summary failed. Surfaced so a thin digest is
  // legible as "some items failed" rather than "a quiet week".
  omittedCount: z.number().int().nonnegative(),
  summaryMarkdown: z.string().nullable(),
  model: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});

export const ListDigestsInput = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();

export const ListDigestsOutput = z.object({
  digests: z.array(DigestOutput),
});

export const GetDigestInput = z.object({
  id: z.number(),
});

export const GetDigestOutput = z.object({
  digest: DigestOutput.nullable(),
});

export const TriggerDigestInput = z
  .object({
    // 0 = the week that just closed. Lets an older period be (re)built, which
    // is otherwise unreachable: the worker only ever materializes the latest.
    weeksAgo: z.number().int().min(0).max(52).optional(),
  })
  .optional();

export const TriggerDigestOutput = z.object({
  digest: DigestOutput,
});

export type DigestStatusDTO = z.infer<typeof DigestStatus>;
export type TriggerDigestInputDTO = z.infer<typeof TriggerDigestInput>;
export type TriggerDigestOutputDTO = z.infer<typeof TriggerDigestOutput>;
export type DigestOutputDTO = z.infer<typeof DigestOutput>;
export type ListDigestsInputDTO = z.infer<typeof ListDigestsInput>;
export type ListDigestsOutputDTO = z.infer<typeof ListDigestsOutput>;
export type GetDigestInputDTO = z.infer<typeof GetDigestInput>;
export type GetDigestOutputDTO = z.infer<typeof GetDigestOutput>;
