// DOM helpers for the reader's semantic find. The article is searched as it
// is rendered, not as stored markdown, so every result the model returns can
// be pointed back at an element on screen.

// Mirrors FIND_LIMITS in the tRPC contract, which the web app cannot import.
export const MAX_PASSAGES = 2_000;
export const MAX_PASSAGE_CHARS = 2_000;

// Blocks that read as one unit. Anything else on the page that should be
// searchable (the title, a thread's original post) opts in with the attribute.
const PASSAGE_SELECTOR = [
  "p",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "td",
  "th",
  "dt",
  "dd",
  "figcaption",
  "[data-find-passage]",
].join(",");

export interface Passage {
  element: Element;
  text: string;
}

/**
 * Collects the innermost passage blocks under `root`, in document order. A
 * blockquote holding paragraphs yields the paragraphs, not the quote as well,
 * so no text is sent (or highlighted) twice.
 */
export function collectPassages(root: Element): Passage[] {
  const passages: Passage[] = [];
  for (const element of root.querySelectorAll(PASSAGE_SELECTOR)) {
    if (element.querySelector(PASSAGE_SELECTOR)) continue;
    const text = collapseWhitespace(element.textContent ?? "");
    if (!text) continue;
    passages.push({ element, text: text.slice(0, MAX_PASSAGE_CHARS) });
    if (passages.length >= MAX_PASSAGES) break;
  }
  return passages;
}

/**
 * Finds `quote` inside `element` and returns a Range over it, ignoring case
 * and differences in whitespace. The quote can span several text nodes —
 * bold, links and code inside a paragraph all split them. Returns null when
 * the quote is not there.
 */
export function rangeForQuote(element: Element, quote: string): Range | null {
  const needle = collapseWhitespace(quote).toLowerCase();
  if (!needle) return null;

  const doc = element.ownerDocument;
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  // `haystack[i]` came from `positions[i]`, so a match in the normalized text
  // maps straight back to a node and offset.
  let haystack = "";
  const positions: Array<{ node: Text; offset: number }> = [];
  let pendingSpace = false;

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    for (let offset = 0; offset < text.data.length; offset++) {
      const char = text.data[offset] ?? "";
      if (/\s/.test(char)) {
        pendingSpace = haystack.length > 0;
        continue;
      }
      if (pendingSpace) {
        haystack += " ";
        positions.push({ node: text, offset });
        pendingSpace = false;
      }
      // Characters whose lowercase form is longer (e.g. "İ") are kept as-is
      // so one haystack character always stands for one source character.
      const lower = char.toLowerCase();
      haystack += lower.length === 1 ? lower : char;
      positions.push({ node: text, offset });
    }
  }

  const at = haystack.indexOf(needle);
  if (at < 0) return null;
  const start = positions[at];
  const end = positions[at + needle.length - 1];
  if (!start || !end) return null;

  const range = doc.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);
  return range;
}

export function rangeForElement(element: Element): Range {
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  return range;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
