import type { UIMessage } from "ai";

export interface ChatArticleRequest {
  /** Aborts the upstream model call when the client goes away. */
  abortSignal?: AbortSignal;
  /** `items.id` of the article the question is about. */
  itemId: number;
  /** Conversation so far, in AI SDK UI message form, sent by `useChat`. */
  messages: UIMessage[];
}

/** The item id did not resolve to a stored article. */
export class ArticleNotFoundError extends Error {
  constructor(itemId: number) {
    super(`No article found for item ${itemId}`);
    this.name = "ArticleNotFoundError";
  }
}

/** No OPENROUTER_API_KEY is configured, so chat is disabled on this instance. */
export class ChatNotConfiguredError extends Error {
  constructor() {
    super("Chat is not configured: set OPENROUTER_API_KEY on the API.");
    this.name = "ChatNotConfiguredError";
  }
}
