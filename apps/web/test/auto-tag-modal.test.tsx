import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AutoTagModal } from "@/features/items/components/AutoTagModal";

type Match = {
  count: number;
  description: string | null;
  tagId: number;
  tagName: string;
};

type TagRun = {
  appliedCount: number;
  errorMessage: string | null;
  finishedAt: string | null;
  id: number;
  itemsScored: number;
  itemsTotal: number;
  matches: Match[];
  model: string | null;
  startedAt: string;
  status: "pending" | "scoring" | "scored" | "applied" | "failed" | "cancelled";
};

type State = {
  estimate?: { itemsTotal: number };
  getRun?: TagRun;
  latestRun: TagRun | null;
};

const { applyMock, cancelMock, getRunOptions, startMock, state } = vi.hoisted(
  () => ({
    applyMock: vi.fn(),
    cancelMock: vi.fn(),
    getRunOptions: vi.fn(),
    startMock: vi.fn(),
    state: { current: { latestRun: null } as State },
  }),
);

vi.mock("@/lib/trpc/react", () => {
  // Mirrors react-query's shape only as far as the modal reads it: data off
  // the queries, mutate/isPending/error off the mutations.
  const mutation = (mutate: ReturnType<typeof vi.fn>) => () => ({
    error: null,
    isPending: false,
    mutate,
  });
  return {
    trpc: {
      tagging: {
        applyRun: { useMutation: mutation(applyMock) },
        cancelRun: { useMutation: mutation(cancelMock) },
        estimateRun: {
          useQuery: () => ({ data: state.current.estimate }),
        },
        getRun: {
          useQuery: (_input: { id: number }, options: unknown) => {
            getRunOptions(options);
            return { data: state.current.getRun };
          },
        },
        latestRun: {
          useQuery: () => ({ data: { run: state.current.latestRun } }),
        },
        startRun: { useMutation: mutation(startMock) },
      },
      tags: {
        list: {
          useQuery: () => ({
            data: {
              tags: [
                { description: "Systems work in Rust", id: 1, name: "rust" },
                { description: null, id: 2, name: "wasm" },
              ],
            },
          }),
        },
      },
    },
  };
});

const run = (overrides: Partial<TagRun>): TagRun => ({
  appliedCount: 0,
  errorMessage: null,
  finishedAt: null,
  id: 9,
  itemsScored: 0,
  itemsTotal: 40,
  matches: [],
  model: "typesafe/jev-1.13-20260917",
  startedAt: "2026-09-20T10:00:00.000Z",
  status: "pending",
  ...overrides,
});

function renderModal() {
  const onApplied = vi.fn();
  const onClose = vi.fn();
  render(<AutoTagModal onApplied={onApplied} onClose={onClose} />);
  return { onApplied, onClose };
}

const check = (name: RegExp) =>
  fireEvent.click(screen.getByRole("checkbox", { name }));

describe("AutoTagModal", () => {
  beforeEach(() => {
    applyMock.mockReset();
    cancelMock.mockReset();
    getRunOptions.mockReset();
    startMock.mockReset();
    state.current = { latestRun: null };
  });

  test("starts nothing until Start is clicked, and sends the chosen tags", () => {
    renderModal();

    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();

    check(/#rust/);
    check(/#wasm/);
    expect(startMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(startMock).toHaveBeenCalledWith({ tagIds: [1, 2] });
  });

  test("shows a tag with no description as judged by name alone", () => {
    renderModal();

    expect(screen.getByText("Systems work in Rust")).toBeInTheDocument();
    expect(
      screen.getByText("no description — judged by name alone"),
    ).toBeInTheDocument();
  });

  test("prices the run before it is started", () => {
    state.current = { estimate: { itemsTotal: 120 }, latestRun: null };
    renderModal();
    check(/#rust/);

    expect(screen.getByText("120 items would be weighed")).toBeInTheDocument();
    expect(screen.getByText("about $0.02")).toBeInTheDocument();
    expect(screen.getByText(/already carrying a selected tag/i)).toBeVisible();
  });

  test("a run too small to cost a cent says so", () => {
    state.current = { estimate: { itemsTotal: 10 }, latestRun: null };
    renderModal();
    check(/#rust/);

    expect(screen.getByText("<$0.01")).toBeInTheDocument();
  });

  test("a scoring run shows its progress and polls", () => {
    state.current = {
      latestRun: run({ itemsScored: 12, itemsTotal: 40, status: "scoring" }),
    };
    renderModal();

    expect(screen.getByText("12 / 40 weighed")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "12",
    );
    expect(getRunOptions).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, refetchInterval: 2000 }),
    );
    // The tag picker is gone: a run owns the modal while it is working.
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  test("a scored run lists the counts, and Apply sends the run id", () => {
    state.current = {
      latestRun: run({
        itemsScored: 40,
        matches: [
          {
            count: 34,
            description: "Systems work in Rust",
            tagId: 1,
            tagName: "rust",
          },
          { count: 7, description: null, tagId: 2, tagName: "wasm" },
        ],
        status: "scored",
      }),
    };
    renderModal();

    expect(screen.getByText("#rust — 34 items")).toBeInTheDocument();
    expect(screen.getByText("#wasm — 7 items")).toBeInTheDocument();
    // Scored is a verdict, not a write: nothing is touched until Apply.
    expect(getRunOptions).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, refetchInterval: false }),
    );
    expect(applyMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^apply/i }));
    expect(applyMock).toHaveBeenCalledWith({ id: 9 });
  });

  test("a scored run that matched nothing offers only Discard", () => {
    state.current = {
      latestRun: run({ itemsScored: 40, matches: [], status: "scored" }),
    };
    renderModal();

    expect(screen.getByText(/nothing matched/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^apply/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(cancelMock).toHaveBeenCalledWith({ id: 9 });
  });

  test("a failed run shows why, and lets another one be started", () => {
    // The failure arrives on a poll, the way it does in the app: the modal
    // adopts the running run first, then sees it fall over.
    state.current = {
      getRun: run({
        errorMessage: "Scoring failed: Insufficient credits",
        status: "failed",
      }),
      latestRun: run({ status: "scoring" }),
    };
    renderModal();

    expect(
      screen.getByText("Scoring failed: Insufficient credits"),
    ).toBeInTheDocument();

    check(/#rust/);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(startMock).toHaveBeenCalledWith({ tagIds: [1] });
  });

  test("an applied run reports what it wrote", () => {
    state.current = {
      getRun: run({ appliedCount: 41, status: "applied" }),
      latestRun: run({ status: "scoring" }),
    };
    const { onClose } = renderModal();

    expect(
      screen.getByText("Applied 41 tags to the library."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  test("escape closes it", () => {
    const { onClose } = renderModal();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
