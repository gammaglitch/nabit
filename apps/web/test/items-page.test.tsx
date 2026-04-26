import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ItemsRoute from "@/app/items/page";

const { invalidateList, invalidateGet, invalidateTagsList, mutateEnqueue } =
  vi.hoisted(() => ({
    invalidateList: vi.fn(),
    invalidateGet: vi.fn(),
    invalidateTagsList: vi.fn(),
    mutateEnqueue: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/trpc/react", () => {
  const mutationStub = () => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ id: 0, name: "stub" }),
  });
  return {
    trpc: {
      useUtils() {
        return {
          ingest: {
            get: { invalidate: invalidateGet },
            jobs: { invalidate: vi.fn() },
            list: { invalidate: invalidateList },
          },
          tags: { list: { invalidate: invalidateTagsList } },
        };
      },
      ingest: {
        ingest: {
          useMutation() {
            return {
              error: null,
              isPending: false,
              mutate: mutateEnqueue,
              mutateAsync: vi.fn(),
            };
          },
        },
        enqueue: {
          useMutation() {
            return {
              error: null,
              isPending: false,
              mutate: mutateEnqueue,
              mutateAsync: vi.fn(),
            };
          },
        },
        get: {
          useQuery(_input: { id: number }, options?: { enabled?: boolean }) {
            if (!options?.enabled) {
              return { data: undefined, error: null, isLoading: false };
            }
            return { data: undefined, error: null, isLoading: false };
          },
        },
        list: {
          useQuery() {
            return {
              data: {
                items: [
                  {
                    author: "delta",
                    commentCount: 1,
                    contentMarkdown: "Long-form extracted article body.",
                    contentText: "Long-form extracted article body.",
                    externalId: "https://example.com/story",
                    id: 1,
                    ingestedAt: "2026-04-04T10:00:00.000Z",
                    latestExtractionStatus: "success",
                    metadata: {},
                    snapshotCount: 1,
                    sourceCreatedAt: "2026-04-03T12:00:00.000Z",
                    sourceType: "webpage",
                    sourceUrl: "https://example.com/story",
                    subjectItemId: null,
                    tags: [{ id: 1, name: "javascript" }],
                    title: "Archiveable Story",
                  },
                ],
                total: 1,
              },
              error: null,
              isLoading: false,
            };
          },
        },
        jobs: {
          useQuery() {
            return {
              data: { jobs: [] },
              error: null,
              isLoading: false,
            };
          },
        },
      },
      tags: {
        list: {
          useQuery() {
            return {
              data: { tags: [{ id: 1, name: "javascript" }] },
              error: null,
              isLoading: false,
            };
          },
        },
        addToItem: { useMutation: mutationStub },
        removeFromItem: { useMutation: mutationStub },
        create: { useMutation: mutationStub },
      },
    },
  };
});

describe("items page", () => {
  test("renders the brutalist library with the archived item title", () => {
    render(<ItemsRoute />);

    expect(screen.getByText("Archiveable Story")).toBeInTheDocument();
    expect(screen.getByText(/shiny thing/)).toBeInTheDocument();
  });

  test("shows the item's tag as a pill in the list", () => {
    render(<ItemsRoute />);

    // Tag appears inline on the row and in the sidebar tag cloud.
    const tagMatches = screen.getAllByText("javascript");
    expect(tagMatches.length).toBeGreaterThanOrEqual(1);
  });
});
