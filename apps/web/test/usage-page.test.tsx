import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import UsagePage from "@/features/usage/screens/UsagePage";

type Summary = {
  byDay: Array<{ costUsd: number; day: string }>;
  byFeature: Array<{
    calls: number;
    costUsd: number | null;
    errors: number;
    feature: string;
    totalTokens: number;
  }>;
  days: number;
  recent: Array<{
    costUsd: number | null;
    createdAt: string;
    durationMs: number | null;
    errorMessage: string | null;
    feature: string;
    id: number;
    model: string;
    status: string;
    totalTokens: number | null;
  }>;
  totals: { calls: number; costUsd: number; errors: number };
};

const { summaryMock, summaryState } = vi.hoisted(() => ({
  summaryMock: vi.fn(),
  summaryState: {
    current: {
      data: undefined as Summary | undefined,
      error: null as { message: string } | null,
      isLoading: false,
    },
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    usage: {
      summary: {
        useQuery: (input: unknown) => {
          summaryMock(input);
          return summaryState.current;
        },
      },
    },
  },
}));

function summary(overrides: Partial<Summary> = {}): Summary {
  return {
    byDay: [
      { costUsd: 0.02, day: "2026-09-20" },
      { costUsd: 0, day: "2026-09-21" },
      { costUsd: 0.1, day: "2026-09-22" },
    ],
    byFeature: [
      {
        calls: 40,
        costUsd: 0.09,
        errors: 1,
        feature: "tag-run",
        totalTokens: 120_000,
      },
      {
        calls: 6,
        costUsd: 0.03,
        errors: 0,
        feature: "chat",
        totalTokens: 18_000,
      },
    ],
    days: 30,
    recent: [
      {
        costUsd: 0.004,
        createdAt: "2026-09-22T08:12:00.000Z",
        durationMs: 2400,
        errorMessage: null,
        feature: "tag-run",
        id: 1,
        model: "anthropic/claude-sonnet-5",
        status: "success",
        totalTokens: 3200,
      },
    ],
    totals: { calls: 46, costUsd: 0.12, errors: 1 },
    ...overrides,
  };
}

describe("UsagePage", () => {
  beforeEach(() => {
    summaryMock.mockReset();
    summaryState.current = {
      data: summary(),
      error: null,
      isLoading: false,
    };
  });

  test("shows what the window cost, ran and failed", () => {
    render(<UsagePage />);

    expect(screen.getByText("$0.12")).toBeInTheDocument();
    expect(screen.getByText("46")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  test("breaks the spend down per feature", () => {
    render(<UsagePage />);

    expect(screen.getByText("$0.09")).toBeInTheDocument();
    expect(screen.getByText(/40 calls/)).toBeInTheDocument();

    expect(screen.getByText("chat")).toBeInTheDocument();
    expect(screen.getByText("$0.03")).toBeInTheDocument();
    expect(screen.getByText(/6 calls/)).toBeInTheDocument();
  });

  test("asks the server again when the window changes", () => {
    render(<UsagePage />);
    expect(summaryMock).toHaveBeenLastCalledWith({ days: 30 });

    fireEvent.click(screen.getByRole("button", { name: "7 days" }));

    expect(summaryMock).toHaveBeenLastCalledWith({ days: 7 });
  });

  test("says a quiet window is quiet instead of drawing an empty table", () => {
    summaryState.current = {
      data: summary({
        byDay: [],
        byFeature: [],
        days: 7,
        recent: [],
        totals: { calls: 0, costUsd: 0, errors: 0 },
      }),
      error: null,
      isLoading: false,
    };
    render(<UsagePage />);

    expect(screen.getByText(/No calls in the last 7 days/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("carries the reason a call failed", () => {
    summaryState.current = {
      data: summary({
        recent: [
          {
            costUsd: null,
            createdAt: "2026-09-22T09:00:00.000Z",
            durationMs: 800,
            errorMessage: "402 Insufficient credits",
            feature: "tag-run",
            id: 9,
            model: "anthropic/claude-haiku-4.5",
            status: "error",
            totalTokens: null,
          },
        ],
      }),
      error: null,
      isLoading: false,
    };
    render(<UsagePage />);

    expect(screen.getByText("402 Insufficient credits")).toBeInTheDocument();
  });
});
