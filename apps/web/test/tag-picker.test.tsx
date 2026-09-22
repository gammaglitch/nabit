import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { TagPicker } from "@/features/items/components/TagPicker";

type SuggestState = {
  data?: {
    model: string;
    suggestions: Array<{
      confidence: number;
      description: string | null;
      id: number;
      name: string;
    }>;
    truncated: boolean;
  };
  error: { message: string } | null;
  isPending: boolean;
  isSuccess: boolean;
};

const { suggestMock, suggestState } = vi.hoisted(() => ({
  suggestMock: vi.fn(),
  suggestState: {
    current: {
      error: null,
      isPending: false,
      isSuccess: false,
    } as SuggestState,
  },
}));

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    tags: {
      suggest: {
        // Mirrors react-query's shape closely enough for the picker: the
        // component reads data/isPending/isSuccess/error off the mutation.
        useMutation: () => {
          const state = suggestState.current;
          return {
            data: state.data,
            error: state.error,
            isPending: state.isPending,
            isSuccess: state.isSuccess,
            mutate: suggestMock,
          };
        },
      },
    },
  },
}));

const item = {
  id: 7,
  tags: [{ description: null, id: 1, name: "javascript" }],
  title: "Why we moved off Postgres full-text search",
};

const allTags = [
  { description: null, id: 1, name: "javascript" },
  { description: null, id: 2, name: "search" },
  { description: null, id: 3, name: "databases" },
];

function renderPicker(
  overrides: Partial<Parameters<typeof TagPicker>[0]> = {},
) {
  const onAddTag = vi.fn();
  const onRemoveTag = vi.fn();
  render(
    <TagPicker
      allTags={allTags}
      anchor="center"
      item={item}
      onAddTag={onAddTag}
      onClose={vi.fn()}
      onRemoveTag={onRemoveTag}
      {...overrides}
    />,
  );
  return { onAddTag, onRemoveTag };
}

describe("TagPicker suggestions", () => {
  beforeEach(() => {
    suggestMock.mockReset();
    suggestState.current = {
      error: null,
      isPending: false,
      isSuccess: false,
    };
  });

  test("asks for suggestions only when the user does", () => {
    renderPicker();
    expect(suggestMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /suggest tags/i }));
    expect(suggestMock).toHaveBeenCalledWith({ itemId: 7 });
  });

  test("offers a suggested tag with its confidence, and adds it on click", async () => {
    suggestState.current = {
      data: {
        model: "typesafe/jev-1.13-20260917",
        suggestions: [
          { confidence: 0.96, description: null, id: 2, name: "search" },
        ],
        truncated: false,
      },
      error: null,
      isPending: false,
      isSuccess: true,
    };
    const { onAddTag } = renderPicker();

    expect(screen.getByText("96%")).toBeInTheDocument();
    // Listed once, as the suggestion, not again in the plain tag list.
    const rows = screen.getAllByRole("button", { name: /#search/ });
    expect(rows).toHaveLength(1);
    fireEvent.click(rows[0] as HTMLElement);

    await waitFor(() => expect(onAddTag).toHaveBeenCalledWith(7, "search"));
  });

  test("never suggests a tag the item already carries", () => {
    suggestState.current = {
      data: {
        model: "m",
        suggestions: [
          { confidence: 0.99, description: null, id: 1, name: "javascript" },
        ],
        truncated: false,
      },
      error: null,
      isPending: false,
      isSuccess: true,
    };
    renderPicker();

    expect(screen.queryByText("99%")).not.toBeInTheDocument();
  });

  test("says so when nothing fits", () => {
    suggestState.current = {
      data: { model: "m", suggestions: [], truncated: false },
      error: null,
      isPending: false,
      isSuccess: true,
    };
    renderPicker();

    expect(screen.getByText(/no existing tag fits/i)).toBeInTheDocument();
  });

  test("surfaces a failure instead of looking like nothing fits", () => {
    suggestState.current = {
      error: { message: "Tag suggestions failed: Insufficient credits" },
      isPending: false,
      isSuccess: false,
    };
    renderPicker();

    expect(
      screen.getByText("Tag suggestions failed: Insufficient credits"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no existing tag fits/i)).not.toBeInTheDocument();
  });
});
