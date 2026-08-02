import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import type { AppEnv } from "../../lib/config/env";
import type { ExportArticleData } from "../export/dto";
import { renderArticleDocument } from "../export/markdown";
import type { ExportService } from "../export/service";
import type { SettingsService } from "../settings/service";
import {
  ArticleNotFoundError,
  type ChatArticleRequest,
  ChatNotConfiguredError,
} from "./dto";

// Comment count is capped independently of the character budget so a huge
// thread is trimmed by rank rather than truncated mid-sentence.
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
    private readonly settingsService: SettingsService,
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

    const [article, settings] = await Promise.all([
      this.exportService.getArticle({ id: input.itemId }),
      this.settingsService.getChatSettings(),
    ]);
    if (!article) {
      throw new ArticleNotFoundError(input.itemId);
    }

    const openrouter = createOpenRouter({ apiKey });

    return streamText({
      abortSignal: input.abortSignal,
      model: openrouter(settings.model),
      messages: await convertToModelMessages(
        takeRecentMessages(input.messages, settings.historyTurns),
      ),
      system: buildSystemPrompt(article, settings.maxContextChars),
    });
  }
}

/**
 * Keeps only the most recent messages. The client sends the whole
 * conversation each turn, and the article is re-sent as the system prompt on
 * top of it, so an unbounded history makes every question more expensive than
 * the last. Trimming from the end keeps the part the follow-up refers to.
 */
export function takeRecentMessages(
  messages: UIMessage[],
  limit: number,
): UIMessage[] {
  return messages.length <= limit ? messages : messages.slice(-limit);
}

function buildSystemPrompt(
  article: ExportArticleData,
  maxContextChars: number,
): string {
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
  const truncated = rendered.length > maxContextChars;
  const document = truncated ? rendered.slice(0, maxContextChars) : rendered;

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
