import type { LlmCallRecord } from "./service";

type Usage = {
  completionTokens?: unknown;
  cost?: unknown;
  promptTokens?: unknown;
  totalTokens?: unknown;
};

/**
 * What a chat-completions call cost, from OpenRouter's usage accounting.
 *
 * Only present when the request asked for it — see `usageAccounting` — and
 * the AI SDK's own token counts stand in when it is missing, so a call is
 * always recorded even if its price is not.
 */
export function readOpenRouterUsage(
  providerMetadata: Record<string, unknown> | undefined,
  fallback?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  },
): Pick<
  LlmCallRecord,
  "completionTokens" | "costUsd" | "promptTokens" | "totalTokens"
> {
  const usage = (providerMetadata?.openrouter as { usage?: Usage } | undefined)
    ?.usage;

  return {
    completionTokens:
      number(usage?.completionTokens) ?? fallback?.outputTokens ?? null,
    costUsd: number(usage?.cost),
    promptTokens: number(usage?.promptTokens) ?? fallback?.inputTokens ?? null,
    totalTokens: number(usage?.totalTokens) ?? fallback?.totalTokens ?? null,
  };
}

/** Asks OpenRouter to price the call. Without it, cost comes back undefined. */
export const usageAccounting = { usage: { include: true } } as const;

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
