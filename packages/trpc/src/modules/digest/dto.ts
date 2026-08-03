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

export type DigestStatusDTO = z.infer<typeof DigestStatus>;
export type DigestOutputDTO = z.infer<typeof DigestOutput>;
export type ListDigestsInputDTO = z.infer<typeof ListDigestsInput>;
export type ListDigestsOutputDTO = z.infer<typeof ListDigestsOutput>;
export type GetDigestInputDTO = z.infer<typeof GetDigestInput>;
export type GetDigestOutputDTO = z.infer<typeof GetDigestOutput>;
