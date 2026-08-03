import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import DigestPage from "@/features/digest/screens/DigestPage";

const { listQueryMock } = vi.hoisted(() => ({
  listQueryMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    useUtils: () => ({ settings: { get: { invalidate: vi.fn() } } }),
    digest: {
      list: { useQuery: () => listQueryMock() },
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

  test("labels the range by its last included day", () => {
    listQueryMock.mockReturnValue({
      data: { digests: [digest()] },
      error: null,
      isLoading: false,
    });

    render(<DigestPage />);

    // Window is half-open: nothing from the 6th is in it, so the label must
    // not read "– 6 Apr".
    expect(screen.getByText("30 Mar 2026 – 5 Apr 2026")).toBeInTheDocument();
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

    expect(
      screen.getByText(/2 items could not be summarized/),
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
});
