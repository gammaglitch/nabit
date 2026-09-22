"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { trpc } from "@/lib/trpc/react";
import {
  collectPassages,
  rangeForElement,
  rangeForQuote,
} from "../utils/find-passages";

// Names referenced by the ::highlight() rules in globals.css.
const HIGHLIGHT_ALL = "nabit-find";
const HIGHLIGHT_ACTIVE = "nabit-find-active";

export interface FindResult {
  element: Element;
  range: Range;
  reason: string;
}

type Status = "idle" | "searching" | "done" | "error";

// The CSS Custom Highlight API paints ranges without touching the DOM, so
// React's tree stays exactly as rendered. Where it is missing (older browsers,
// jsdom) results still scroll into view, just unpainted.
function highlightRegistry(): HighlightRegistry | null {
  if (typeof CSS === "undefined" || !("highlights" in CSS)) return null;
  if (typeof Highlight === "undefined") return null;
  return CSS.highlights;
}

function paint(results: FindResult[], activeIndex: number) {
  const registry = highlightRegistry();
  if (!registry) return;
  const active = results[activeIndex];
  registry.set(
    HIGHLIGHT_ALL,
    new Highlight(
      ...results.filter((r) => r !== active).map((result) => result.range),
    ),
  );
  if (active) registry.set(HIGHLIGHT_ACTIVE, new Highlight(active.range));
  else registry.delete(HIGHLIGHT_ACTIVE);
}

function clearPaint() {
  const registry = highlightRegistry();
  registry?.delete(HIGHLIGHT_ALL);
  registry?.delete(HIGHLIGHT_ACTIVE);
}

/**
 * State for the reader's cmd+f: sends the rendered article's passages and the
 * query to the model, then maps its picks back onto the page.
 */
export function useSemanticFind(containerRef: RefObject<Element | null>) {
  // mutateAsync is stable; the mutation object itself is new every render.
  const { mutateAsync: searchPassages } = trpc.find.search.useMutation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [results, setResults] = useState<FindResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  // A later search, or closing the bar, supersedes one still in flight.
  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    requestId.current++;
    clearPaint();
    setResults([]);
    setActiveIndex(0);
    setSearchedQuery(null);
    setStatus("idle");
    setError(null);
    setTruncated(false);
  }, []);

  // Opening again while open refocuses the box, like a second cmd+f does in a
  // browser. The select() leaves the old query ready to be typed over.
  const open = useCallback(() => {
    setIsOpen(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);
  const close = useCallback(() => {
    setIsOpen(false);
    reset();
  }, [reset]);

  useEffect(() => clearPaint, []);

  useEffect(() => {
    paint(results, activeIndex);
    const active = results[activeIndex];
    // jsdom has no scrollIntoView.
    active?.element.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [results, activeIndex]);

  const run = useCallback(async () => {
    const trimmed = query.trim();
    const root = containerRef.current;
    if (!trimmed || !root) return;

    const passages = collectPassages(root);
    if (passages.length === 0) {
      reset();
      setStatus("done");
      setSearchedQuery(trimmed);
      return;
    }

    const id = ++requestId.current;
    clearPaint();
    setResults([]);
    setActiveIndex(0);
    setError(null);
    setStatus("searching");
    setSearchedQuery(trimmed);

    try {
      const response = await searchPassages({
        passages: passages.map((passage) => passage.text),
        query: trimmed,
      });
      if (id !== requestId.current) return;

      const mapped: FindResult[] = [];
      for (const match of response.matches) {
        const passage = passages[match.passage];
        // The article can re-render mid-search (a re-extract landing).
        if (!passage?.element.isConnected) continue;
        const range =
          (match.quote && rangeForQuote(passage.element, match.quote)) ||
          rangeForElement(passage.element);
        mapped.push({ element: passage.element, range, reason: match.reason });
      }
      setResults(mapped);
      setTruncated(response.truncated);
      setStatus("done");
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    }
  }, [containerRef, query, reset, searchPassages]);

  const step = useCallback(
    (delta: number) => {
      if (results.length === 0) return;
      setActiveIndex(
        (current) => (current + delta + results.length) % results.length,
      );
    },
    [results.length],
  );

  /**
   * Enter: search, or, when the query has not changed since the last search,
   * move to the next result the way a normal find does.
   */
  const submit = useCallback(
    (backwards = false) => {
      if (status === "searching") return;
      if (
        searchedQuery !== null &&
        searchedQuery === query.trim() &&
        results.length > 0
      ) {
        step(backwards ? -1 : 1);
        return;
      }
      void run();
    },
    [query, results.length, run, searchedQuery, status, step],
  );

  return {
    activeIndex,
    close,
    error,
    inputRef,
    isOpen,
    next: () => step(1),
    open,
    previous: () => step(-1),
    query,
    results,
    searchedQuery,
    setQuery,
    status,
    submit,
    truncated,
  };
}

export type SemanticFind = ReturnType<typeof useSemanticFind>;
