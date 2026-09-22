import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import TagsPage from "@/features/tags/screens/TagsPage";

const { createMock, listState, updateMock, updateState } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  listState: {
    current: {
      data: {
        tags: [] as Array<{
          description: string | null;
          id: number;
          itemCount: number;
          name: string;
        }>,
      },
      isLoading: false,
    },
  },
  updateState: {
    current: { error: null as { message: string } | null, isPending: false },
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    ingest: {
      get: { useQuery: () => ({ data: undefined }) },
      list: { useQuery: () => ({ data: undefined }) },
    },
    tags: {
      create: {
        useMutation: () => ({
          error: null,
          isPending: false,
          mutate: createMock,
        }),
      },
      list: { useQuery: () => listState.current },
      update: {
        useMutation: () => ({
          error: updateState.current.error,
          isPending: updateState.current.isPending,
          mutate: updateMock,
          variables: undefined,
        }),
      },
    },
    useUtils: () => ({
      ingest: { get: { invalidate: vi.fn() }, list: { invalidate: vi.fn() } },
      tags: { list: { invalidate: vi.fn() } },
    }),
  },
}));

describe("TagsPage", () => {
  beforeEach(() => {
    createMock.mockReset();
    updateMock.mockReset();
    updateState.current = { error: null, isPending: false };
    listState.current = {
      data: {
        tags: [
          {
            description: "The programming language.",
            id: 1,
            itemCount: 3,
            name: "rust",
          },
          { description: null, id: 2, itemCount: 0, name: "woodworking" },
        ],
      },
      isLoading: false,
    };
  });

  test("creates a tag with its description in one step", () => {
    render(<TagsPage />);

    fireEvent.change(screen.getByLabelText("Tag name"), {
      target: { value: "  Hiring  " },
    });
    fireEvent.change(screen.getByLabelText("Tag description"), {
      target: { value: "Interviewing and job ladders." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(createMock).toHaveBeenCalledWith({
      description: "Interviewing and job ladders.",
      name: "Hiring",
    });
  });

  test("a tag with no description can be created anyway", () => {
    render(<TagsPage />);

    fireEvent.change(screen.getByLabelText("Tag name"), {
      target: { value: "reading" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    expect(createMock).toHaveBeenCalledWith({
      description: null,
      name: "reading",
    });
  });

  test("shows each tag with what it holds", () => {
    render(<TagsPage />);

    expect(screen.getByDisplayValue("rust")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("The programming language."),
    ).toBeInTheDocument();
    expect(screen.getByText("3 items")).toBeInTheDocument();
    expect(screen.getByText("0 items")).toBeInTheDocument();
  });

  test("renames a tag, keeping its description", () => {
    render(<TagsPage />);

    fireEvent.change(screen.getByLabelText("Name of #rust"), {
      target: { value: "rust-lang" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(updateMock).toHaveBeenCalledWith({
      description: "The programming language.",
      id: 1,
      name: "rust-lang",
    });
  });

  test("writes a description onto a tag that had none", () => {
    render(<TagsPage />);

    fireEvent.change(screen.getByLabelText("Description of #woodworking"), {
      target: { value: "Hand tools and joinery." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(updateMock).toHaveBeenCalledWith({
      description: "Hand tools and joinery.",
      id: 2,
      name: "woodworking",
    });
  });

  test("offers no save until something is edited", () => {
    render(<TagsPage />);

    expect(
      screen.queryByRole("button", { name: /^save$/i }),
    ).not.toBeInTheDocument();
  });

  test("surfaces a rejected rename", () => {
    updateState.current = {
      error: { message: "A tag called #woodworking already exists." },
      isPending: false,
    };
    render(<TagsPage />);

    expect(
      screen.getByText("A tag called #woodworking already exists."),
    ).toBeInTheDocument();
  });
});
