import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { convertToModelMessages, streamText } from "ai";
import type { AppEnv } from "../../lib/config/env";
import type { ExportArticleData } from "../export/dto";
import { renderArticleDocument } from "../export/markdown";
import type { ExportService } from "../export/service";
import {
  ArticleNotFoundError,
  type ChatArticleRequest,
  ChatNotConfiguredError,
} from "./dto";

// The whole article is re-sent as the system prompt on every turn, so these
// caps are about cost rather than capacity — they stop a 4000-comment HN
// thread from turning a one-line question into a very expensive request.
// Truncation is announced in the prompt so the model can say what it is
// missing instead of confidently answering from a silently cut document.
const MAX_CONTEXT_CHARS = 120_000;
const MAX_CONTEXT_COMMENTS = 200;

const SYSTEM_PREAMBLE = `You are a reading assistant inside nabit, a personal web archive. The user is reading the archived document below and will ask questions about it.

How to answer:
- Treat the document (and its comments, if present) as the source of truth.
- When the document does not cover something, say so plainly. You may then answer from general knowledge, but label that part as coming from outside the article.
- Quote short passages when it helps ground an answer.
- Comments are readers' opinions, not the article's claims. Attribute them.
- Be concise and concrete. Skip preamble and restating the question.`;

export class ChatService {
  constructor(
    private readonly exportService: ExportService,
    private readonly env: AppEnv,
  ) {}

  /**
   * Streams an answer about one archived article. Returns the AI SDK stream
   * result so the route can pipe it straight to the HTTP response.
   */
  async streamArticleChat(input: ChatArticleRequest) {
    const apiKey = this.env.openrouter.apiKey;
    if (!apiKey) {
      throw new ChatNotConfiguredError();
    }

    const article = await this.exportService.getArticle({ id: input.itemId });
    if (!article) {
      throw new ArticleNotFoundError(input.itemId);
    }

    const openrouter = createOpenRouter({ apiKey });

    return streamText({
      abortSignal: input.abortSignal,
      model: openrouter(this.env.openrouter.model),
      messages: await convertToModelMessages(input.messages),
      system: buildSystemPrompt(article),
    });
  }
}

function buildSystemPrompt(article: ExportArticleData): string {
  // No assetBaseUrl: image URLs stay root-relative because the model cannot
  // fetch them either way, and absolute URLs would just burn tokens.
  const rendered = renderArticleDocument(article, {
    comments: true,
    maxComments: MAX_CONTEXT_COMMENTS,
  });

  const commentsDropped = Math.max(
    0,
    article.comments.length - MAX_CONTEXT_COMMENTS,
  );
  const truncated = rendered.length > MAX_CONTEXT_CHARS;
  const document = truncated ? rendered.slice(0, MAX_CONTEXT_CHARS) : rendered;

  const notes: string[] = [];
  if (truncated) {
    notes.push(
      "This document was cut off at a length limit, so the ending is missing.",
    );
  }
  if (commentsDropped > 0) {
    notes.push(`${commentsDropped} lower-ranked comments were omitted.`);
  }
  const truncationNote =
    notes.length > 0
      ? `\n\nNote: ${notes.join(" ")} If the user asks about something that would plausibly be in the omitted part, say it is not in the excerpt you were given.`
      : "";

  return `${SYSTEM_PREAMBLE}${truncationNote}

--- BEGIN ARCHIVED DOCUMENT ---
${document}
--- END ARCHIVED DOCUMENT ---`;
}
