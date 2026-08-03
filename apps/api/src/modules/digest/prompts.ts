/**
 * Prompt construction for the digest pipeline. Pure and dependency-free so the
 * shape of what reaches the model can be asserted in tests without spending
 * anything.
 */

/**
 * Bumped whenever the summary brief changes materially. Stored alongside each
 * summary so rows written to an older brief can be identified and regenerated
 * rather than silently mixed into a digest.
 */
export const SUMMARY_PROMPT_VERSION = 1;

const SUMMARY_SYSTEM = `You are summarizing one archived article for a weekly reading digest.

Write 2-4 sentences covering what the article actually says — its claim, its evidence, and anything a reader would want to know before deciding to read it in full.

Rules:
- Lead with the substance, not the framing. No "This article discusses…".
- Concrete over vague: name the thing, quote a number, say what changed.
- If the text is an excerpt that cuts off, summarize what is present and do not speculate about the rest.
- If comments are included, they are readers' opinions, not the article's claims. Only mention them if they materially change the picture.
- Output plain prose. No headings, no bullets, no preamble.`;

const DIGEST_SYSTEM = `You are writing a weekly digest for someone's personal web archive. You are given short summaries of everything they saved this week.

Write the digest in Markdown:
- Open with two or three sentences on what the week actually contained — the themes, the through-lines, anything that recurs across items. Do not just restate the count.
- Then a "## Items" section: one bullet per article, each as a Markdown link to its source URL, followed by an em dash and one tight sentence. Keep the given order.
- If a genuine theme connects several items, say so in the opening rather than inventing a section per item.

Rules:
- Do not invent anything absent from the summaries. They are your only source.
- No preamble, no sign-off, no "here is your digest".
- Start directly with the prose. Do not add a top-level title; one is added for you.`;

export interface SummaryPromptInput {
  document: string;
  maxContextChars: number;
  title: string | null;
}

export interface SummaryPrompt {
  /** Exact text handed to the model — also what gets hashed for staleness. */
  prompt: string;
  system: string;
  truncated: boolean;
}

export function buildSummaryPrompt(input: SummaryPromptInput): SummaryPrompt {
  const truncated = input.document.length > input.maxContextChars;
  const document = truncated
    ? input.document.slice(0, input.maxContextChars)
    : input.document;

  const truncationNote = truncated
    ? "\n\nNote: this document was cut off at a length limit, so the ending is missing. Summarize only what is present."
    : "";

  const heading = input.title ? `Title: ${input.title}\n\n` : "";

  return {
    prompt: `${heading}${truncationNote ? `${truncationNote.trim()}\n\n` : ""}--- BEGIN ARCHIVED DOCUMENT ---
${document}
--- END ARCHIVED DOCUMENT ---`,
    system: SUMMARY_SYSTEM,
    truncated,
  };
}

export interface DigestItemInput {
  sourceType: string;
  sourceUrl: string | null;
  summary: string;
  title: string | null;
}

export interface DigestPrompt {
  prompt: string;
  system: string;
}

export function buildDigestPrompt(
  items: DigestItemInput[],
  context: { omittedCount: number; periodLabel: string },
): DigestPrompt {
  const rendered = items
    .map((item, index) => {
      const title = item.title?.trim() || "Untitled";
      const url = item.sourceUrl ?? "(no source URL)";
      return `${index + 1}. ${title}\n   Source: ${item.sourceType} — ${url}\n   Summary: ${item.summary.trim()}`;
    })
    .join("\n\n");

  // Stated rather than hidden: a digest that quietly dropped items would read
  // as a complete week when it is not. Covers summary failures, articles with
  // no extracted body, and anything past the per-run item cap.
  const omissionNote =
    context.omittedCount > 0
      ? `\n\nNote: ${context.omittedCount} further item(s) from this week are not included below. Mention this in one short clause at the end of the opening paragraph.`
      : "";

  return {
    prompt: `Week: ${context.periodLabel}
Items saved: ${items.length}${omissionNote}

${rendered}`,
    system: DIGEST_SYSTEM,
  };
}
