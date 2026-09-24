import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { QueueStatus } from "@/features/items/components/QueueStatus";

type Run = {
  errorMessage: string | null;
  failedCount: number;
  id: number;
  itemsScored: number;
  itemsTotal: number;
  matches: Array<{ count: number; tagId: number; tagName: string }>;
  status: string;
};

const { errorState, runState } = vi.hoisted(() => ({
  errorState: { current: null as { message: string } | null },
  runState: { current: null as Run | null },
}));

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    ingest: {
      jobs: {
        useQuery: () => ({
          data: { counts: { processing: 0, queued: 0 }, jobs: [] },
          error: null,
        }),
      },
    },
    tagging: {
      latestRun: {
        useQuery: () => ({
          data: errorState.current ? undefined : { run: runState.current },
          error: errorState.current,
        }),
      },
    },
    useUtils: () => ({ ingest: { list: { invalidate: vi.fn() } } }),
  },
}));

function renderQueue(onOpenAutoTag = vi.fn()) {
  render(<QueueStatus onOpenAutoTag={onOpenAutoTag} onOpenCapture={vi.fn()} />);
  return onOpenAutoTag;
}

function scoringRun(overrides: Partial<Run> = {}): Run {
  return {
    errorMessage: null,
    failedCount: 0,
    id: 1,
    itemsScored: 120,
    itemsTotal: 354,
    matches: [{ count: 66, tagId: 1, tagName: "rust" }],
    status: "scoring",
    ...overrides,
  };
}

describe("QueueStatus and a bulk tagging pass", () => {
  beforeEach(() => {
    errorState.current = null;
    runState.current = null;
  });

  test("reads as idle when nothing is running", () => {
    renderQueue();

    expect(
      screen.getByRole("button", { name: /queue idle/i }),
    ).toBeInTheDocument();
  });

  test("shows a scoring pass in the badge and the panel", () => {
    runState.current = scoringRun();
    renderQueue();

    // The badge alone answers "is it still going", without opening anything.
    const badge = screen.getByRole("button", { name: /tagging 120\/354/i });
    fireEvent.click(badge);

    expect(screen.getByText("Auto-tagging")).toBeInTheDocument();
    expect(screen.getByText("120/354")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "120",
    );
    expect(screen.getByText(/66 matches so far/)).toBeInTheDocument();
    expect(
      screen.getByText(/nothing is applied until you approve it/i),
    ).toBeInTheDocument();
  });

  test("says a pass is still waiting for the worker", () => {
    runState.current = scoringRun({ itemsScored: 0, status: "pending" });
    renderQueue();

    fireEvent.click(screen.getByRole("button", { name: /tagging 0\/354/i }));
    expect(screen.getByText(/waiting for the worker/i)).toBeInTheDocument();
  });

  test("counts what the pass could not score", () => {
    runState.current = scoringRun({ failedCount: 3 });
    renderQueue();

    fireEvent.click(screen.getByRole("button", { name: /tagging/i }));
    expect(screen.getByText(/3 could not be scored/)).toBeInTheDocument();
  });

  test("keeps a finished pass in the queue until it is approved", () => {
    // The state that most needs saying: it has spent the money and will do
    // nothing further on its own. Hiding it here stranded 554 real tags.
    runState.current = scoringRun({
      itemsScored: 354,
      matches: [
        { count: 166, tagId: 1, tagName: "dev" },
        { count: 43, tagId: 2, tagName: "llm-coding" },
      ],
      status: "scored",
    });
    renderQueue();

    fireEvent.click(screen.getByRole("button", { name: /209 tags ready/i }));
    expect(screen.getByText("Tags ready to apply")).toBeInTheDocument();
  });

  test("a finished pass opens the approval modal when clicked", () => {
    runState.current = scoringRun({ itemsScored: 354, status: "scored" });
    const onOpenAutoTag = renderQueue();

    fireEvent.click(screen.getByRole("button", { name: /66 tags ready/i }));
    fireEvent.click(screen.getByRole("button", { name: /click to review/i }));

    expect(onOpenAutoTag).toHaveBeenCalledTimes(1);
  });

  test("shows a pass that gave up, with why", () => {
    runState.current = scoringRun({
      errorMessage: "Auto-tagging failed: HTTP 403: blocked",
      status: "failed",
    });
    renderQueue();

    fireEvent.click(screen.getByRole("button", { name: /tagging failed/i }));
    expect(screen.getByText(/HTTP 403: blocked/)).toBeInTheDocument();
    // Nothing to approve, so the row is not a way into the modal.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  test("says so when the tagging status cannot be read", () => {
    runState.current = null;
    errorState.current = { message: "Find failed: nope" };
    renderQueue();

    fireEvent.click(screen.getByRole("button", { name: /queue idle/i }));
    expect(screen.getByText(/TAGGING STATUS UNAVAILABLE/i)).toBeInTheDocument();
  });
});
