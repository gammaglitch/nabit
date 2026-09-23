import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { QueueStatus } from "@/features/items/components/QueueStatus";

type Run = {
  failedCount: number;
  id: number;
  itemsScored: number;
  itemsTotal: number;
  matches: Array<{ count: number; tagId: number; tagName: string }>;
  status: string;
};

const { runState } = vi.hoisted(() => ({
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
        useQuery: () => ({ data: { run: runState.current }, error: null }),
      },
    },
    useUtils: () => ({ ingest: { list: { invalidate: vi.fn() } } }),
  },
}));

function scoringRun(overrides: Partial<Run> = {}): Run {
  return {
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
    runState.current = null;
  });

  test("reads as idle when nothing is running", () => {
    render(<QueueStatus onOpenCapture={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /queue idle/i }),
    ).toBeInTheDocument();
  });

  test("shows a scoring pass in the badge and the panel", () => {
    runState.current = scoringRun();
    render(<QueueStatus onOpenCapture={vi.fn()} />);

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
    render(<QueueStatus onOpenCapture={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /tagging 0\/354/i }));
    expect(screen.getByText(/waiting for the worker/i)).toBeInTheDocument();
  });

  test("counts what the pass could not score", () => {
    runState.current = scoringRun({ failedCount: 3 });
    render(<QueueStatus onOpenCapture={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /tagging/i }));
    expect(screen.getByText(/3 could not be scored/)).toBeInTheDocument();
  });

  test("drops out of the queue once the pass is waiting on the user", () => {
    // Scored is finished work: it belongs in the modal that asks about it, not
    // in the queue of things still running.
    runState.current = scoringRun({ status: "scored" });
    render(<QueueStatus onOpenCapture={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /queue idle/i }),
    ).toBeInTheDocument();
  });
});
