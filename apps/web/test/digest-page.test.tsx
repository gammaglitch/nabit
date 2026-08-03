import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import DigestPage from "@/features/digest/screens/DigestPage";

const { listQueryMock, triggerMock } = vi.hoisted(() => ({
  listQueryMock: vi.fn(),
  triggerMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    useUtils: () => ({
      digest: { list: { invalidate: vi.fn() } },
      settings: { get: { invalidate: vi.fn() } },
    }),
    digest: {
      list: { useQuery: () => listQueryMock() },
      trigger: {
        useMutation: () => ({ isPending: false, mutate: triggerMock }),
      },
    },
    settings: {
      get: {
        useQuery: () => ({ data: undefined, error: null, isLoading: true }),
      },
      update: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

function digest(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: "2026-04-06T08:00:00.000Z",
    errorMessage: null,
    finishedAt: "2026-04-06T08:05:00.000Z",
    id: 1,
    itemCount: 3,
    model: "anthropic/claude-sonnet-5",
    omittedCount: 0,
    periodEnd: "2026-04-06T08:00:00.000Z",
    periodLabel: "30 Mar 2026 – 5 Apr 2026",
    periodStart: "2026-03-30T08:00:00.000Z",
    status: "success",
    summaryMarkdown: "# Week of 30 Mar 2026\n\nA quiet week of Rust posts.",
    ...overrides,
  };
}

describe("DigestPage", () => {
  test("renders the newest digest without needing a click", () => {
    listQueryMock.mockReturnValue({
      data: { digests: [digest()] },
      error: null,
      isLoading: false,
    });

    render(<DigestPage />);

    expect(screen.getByText("A quiet week of Rust posts.")).toBeInTheDocument();
    expect(screen.getByText(/READY · 3 items/)).toBeInTheDocument();
  });

  test("renders the server's label rather than re-deriving it locally", () => {
    listQueryMock.mockReturnValue({
      data: {
        // A label that could not be produced from these timestamps in the
        // browser's timezone. Re-deriving would disagree with the digest's own
        // heading whenever the instance's zone differs from the viewer's.
        digests: [digest({ periodLabel: "SERVER FORMATTED RANGE" })],
      },
      error: null,
      isLoading: false,
    });

    render(<DigestPage />);

    expect(screen.getByText("SERVER FORMATTED RANGE")).toBeInTheDocument();
  });

  test("explains an empty week instead of rendering a blank pane", () => {
    listQueryMock.mockReturnValue({
      data: {
        digests: [
          digest({ itemCount: 0, status: "empty", summaryMarkdown: null }),
        ],
      },
      error: null,
      isLoading: false,
    });

    render(<DigestPage />);

    expect(
      screen.getByText("Nothing was marked for the digest this week."),
    ).toBeInTheDocument();
  });

  test("surfaces the failure reason on a failed run", () => {
    listQueryMock.mockReturnValue({
      data: {
        digests: [
          digest({
            errorMessage: "OPENROUTER_API_KEY is not configured",
            status: "failed",
            summaryMarkdown: null,
          }),
        ],
      },
      error: null,
      isLoading: false,
    });

    render(<DigestPage />);

    expect(
      screen.getByText("OPENROUTER_API_KEY is not configured"),
    ).toBeInTheDocument();
  });

  test("discloses partially-summarized weeks rather than reading complete", () => {
    listQueryMock.mockReturnValue({
      data: { digests: [digest({ omittedCount: 2 })] },
      error: null,
      isLoading: false,
    });

    render(<DigestPage />);

    // Covers summary failures, bodyless articles, and anything past the
    // maxItems cap — all three now land in omittedCount.
    expect(
      screen.getByText(/2 items from this week are not included/),
    ).toBeInTheDocument();
  });

  test("tells a new user how digests get populated", () => {
    listQueryMock.mockReturnValue({
      data: { digests: [] },
      error: null,
      isLoading: false,
    });

    render(<DigestPage />);

    expect(screen.getByText("No digests yet.")).toBeInTheDocument();
    expect(screen.getByText(/Mark articles with/)).toBeInTheDocument();
  });

  test("switches panes when another week is selected", () => {
    listQueryMock.mockReturnValue({
      data: {
        digests: [
          digest(),
          digest({
            id: 2,
            periodEnd: "2026-03-30T08:00:00.000Z",
            periodLabel: "23 Mar 2026 – 29 Mar 2026",
            periodStart: "2026-03-23T08:00:00.000Z",
            summaryMarkdown: "# Earlier week\n\nAn older digest body.",
          }),
        ],
      },
      error: null,
      isLoading: false,
    });

    render(<DigestPage />);

    expect(screen.getByText("A quiet week of Rust posts.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("23 Mar 2026 – 29 Mar 2026"));

    expect(screen.getByText("An older digest body.")).toBeInTheDocument();
  });

  test("queues a rebuild from the header", () => {
    listQueryMock.mockReturnValue({
      data: { digests: [digest()] },
      error: null,
      isLoading: false,
    });

    render(<DigestPage />);

    fireEvent.click(screen.getByText("Build latest"));

    // Without this the pipeline can only be exercised by waiting a real week.
    expect(triggerMock).toHaveBeenCalledWith({});
  });

  test("falls back to the newest digest when the selection disappears", () => {
    // Selecting the older row and then having it vanish from a refetch must
    // not leave a blank pane.
    const older = digest({
      id: 2,
      periodLabel: "23 Mar 2026 – 29 Mar 2026",
      summaryMarkdown: "# Earlier week\n\nAn older digest body.",
    });
    listQueryMock.mockReturnValue({
      data: { digests: [digest(), older] },
      error: null,
      isLoading: false,
    });

    const { rerender } = render(<DigestPage />);
    fireEvent.click(screen.getByText("23 Mar 2026 – 29 Mar 2026"));
    expect(screen.getByText("An older digest body.")).toBeInTheDocument();

    listQueryMock.mockReturnValue({
      data: { digests: [digest()] },
      error: null,
      isLoading: false,
    });
    rerender(<DigestPage />);

    expect(screen.getByText("A quiet week of Rust posts.")).toBeInTheDocument();
  });
});
