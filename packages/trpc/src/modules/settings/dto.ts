import { z } from "zod";

export const ChatSettingsOutput = z.object({
  /**
   * Whether OPENROUTER_API_KEY is set on the API. The key is never returned —
   * it stays an env var so a live billing credential is not stored in the DB.
   */
  apiKeyConfigured: z.boolean(),
  historyTurns: z.number(),
  maxContextChars: z.number(),
  model: z.string(),
});

export const UpdateChatSettingsInput = z.object({
  historyTurns: z.number().int().min(1).max(50).optional(),
  maxContextChars: z.number().int().min(1_000).max(500_000).optional(),
  model: z.string().min(1).max(200).optional(),
});

export const UpdateChatSettingsOutput = ChatSettingsOutput;

export type ChatSettingsOutputDTO = z.infer<typeof ChatSettingsOutput>;
export type UpdateChatSettingsInputDTO = z.infer<
  typeof UpdateChatSettingsInput
>;
export type UpdateChatSettingsOutputDTO = z.infer<
  typeof UpdateChatSettingsOutput
>;
