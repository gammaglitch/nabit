import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CaptureModal } from "@/features/items/components/CaptureModal";

const { mutateEnqueue } = vi.hoisted(() => ({
  mutateEnqueue: vi.fn(),
}));

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    useUtils: () => ({
      ingest: { jobs: { invalidate: vi.fn() } },
    }),
    ingest: {
      enqueue: {
        useMutation: () => ({
          error: null,
          isPending: false,
          mutate: mutateEnqueue,
          mutateAsync: vi.fn(),
        }),
      },
    },
  },
}));

const URL_UNDER_TEST = "https://example.com/an-article";

function typeUrl(value: string) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value } });
}

describe("CaptureModal digest opt-in", () => {
  beforeEach(() => {
    mutateEnqueue.mockClear();
  });

  test("nabs without enrolling in the digest by default", () => {
    render(<CaptureModal open onOpenChange={vi.fn()} />);

    typeUrl(URL_UNDER_TEST);
    fireEvent.click(screen.getByRole("option", { name: /Nab/ }));

    // Opting in costs money per item, so an untouched form must never enroll.
    expect(mutateEnqueue).toHaveBeenCalledWith({
      digestOptIn: false,
      url: URL_UNDER_TEST,
    });
  });

  test("nabs with the digest flag once the toggle is ticked", () => {
    render(<CaptureModal open onOpenChange={vi.fn()} />);

    typeUrl(URL_UNDER_TEST);
    fireEvent.click(
      screen.getByRole("switch", { name: "Include in weekly digest" }),
    );
    fireEvent.click(screen.getByRole("option", { name: /Nab/ }));

    expect(mutateEnqueue).toHaveBeenCalledWith({
      digestOptIn: true,
      url: URL_UNDER_TEST,
    });
  });
});
