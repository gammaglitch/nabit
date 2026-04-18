import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import ItemsRoute from "@/app/items/page";

const invalidateList = vi.fn();
const invalidateGet = vi.fn();
const invalidateTagsList = vi.fn();
const mutateDelete = vi.fn();
const mutateIngest = vi.fn();
const mutateAddTag = vi.fn();
const mutateRemoveTag = vi.fn();
const mutateCreateTag = vi.fn();

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    useUtils() {
      return {
        ingest: {
          get: { invalidate: invalidateGet },
          list: { invalidate: invalidateList },
        },
        tags: {
          list: { invalidate: invalidateTagsList },
        },
      };
    },
    ingest: {
      delete: {
        useMutation() {
          return { isPending: false, mutate: mutateDelete };
        },
      },
      ingest: {
        useMutation() {
          return { error: null, isPending: false, mutate: mutateIngest };
        },
      },
      get: {
        useQuery(input: { id: number }, options?: { enabled?: boolean }) {
          if (!options?.enabled || input.id !== 1) {
            return { data: undefined, error: null, isLoading: false };
          }

          return {
            data: {
              item: {
                author: "delta",
                commentCount: 1,
                comments: [
                  {
                    author: "reply_guy",
                    contentText: "This aged well.",
                    externalId: "c-1",
                    id: 11,
                    metadata: {},
                    parentExternalId: null,
                    path: "n0001",
                    sourceCreatedAt: null,
                  },
                ],
                contentMarkdown: "Long-form extracted article body.",
                contentText: "Long-form extracted article body.",
                discussions: [],
                externalId: "https://example.com/story",
                extractions: [
                  {
                    errorMessage: null,
                    extractedAt: "2026-04-04T10:00:00.000Z",
                    extractor: "readability",
                    extractorVersion: "0.1.0",
                    id: 7,
                    snapshotId: 5,
                    status: "success",
                  },
                ],
                id: 1,
                ingestedAt: "2026-04-04T10:00:00.000Z",
                latestExtractionStatus: "success",
                metadata: { siteName: "Example", wordCount: 1234 },
                snapshotCount: 1,
                snapshots: [
                  {
                    body: "<html><body>story</body></html>",
                    capturedAt: "2026-04-04T09:59:00.000Z",
                    contentType: "text/html",
                    id: 5,
                  },
                ],
                sourceCreatedAt: "2026-04-03T12:00:00.000Z",
                sourceType: "article",
                sourceUrl: "https://example.com/story",
                subjectItemId: null,
                tags: [{ id: 1, name: "javascript" }],
                title: "Archiveable Story",
              },
            },
            error: null,
            isLoading: false,
          };
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
                  sourceType: "article",
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
      addToItem: {
        useMutation() {
          return { isPending: false, mutate: mutateAddTag };
        },
      },
      removeFromItem: {
        useMutation() {
          return { isPending: false, mutate: mutateRemoveTag };
        },
      },
      create: {
        useMutation() {
          return { isPending: false, mutate: mutateCreateTag };
        },
      },
    },
  },
}));

describe("items page", () => {
  test("renders the archive list and selected item detail", async () => {
    render(<ItemsRoute />);

    expect(
      screen.getByRole("heading", { name: "Archiveable Story" }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText("Long-form extracted article body."),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("This aged well.")).toBeInTheDocument();
    expect(screen.getByText("readability")).toBeInTheDocument();
    expect(screen.getByText("text/html")).toBeInTheDocument();
  });

  test("renders tag chips in the list and detail", () => {
    render(<ItemsRoute />);

    const tagChips = screen.getAllByText("javascript");
    expect(tagChips.length).toBeGreaterThanOrEqual(2);
  });
});
