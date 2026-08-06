import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ReaderPage from "@/features/reader/screens/ReaderPage";

type MockComment = {
  author: string | null;
  contentText: string;
  externalId: string | null;
  id: number;
  metadata: Record<string, unknown>;
  parentExternalId: string | null;
  path: string;
  sourceCreatedAt: string | null;
};

type MockLinkedItem = {
  author: string | null;
  commentCount: number;
  contentMarkdown: string | null;
  contentText: string | null;
  digestOptIn: boolean;
  externalId: string | null;
  id: number;
  ingestedAt: string;
  latestExtractionStatus: string | null;
  metadata: Record<string, unknown>;
  snapshotCount: number;
  sourceCreatedAt: string | null;
  sourceType: string;
  sourceUrl: string | null;
  subjectItemId: number | null;
  tags: Array<{ id: number; name: string }>;
  title: string | null;
};

type MockItem = {
  author: string | null;
  commentCount: number;
  comments: MockComment[];
  contentMarkdown: string | null;
  contentText: string | null;
  digestOptIn: boolean;
  linkedItem: MockLinkedItem | null;
  externalId: string | null;
  extractions: never[];
  id: number;
  ingestedAt: string;
  latestExtractionStatus: string | null;
  metadata: Record<string, unknown>;
  snapshotCount: number;
  snapshots: never[];
  sourceCreatedAt: string | null;
  sourceType: string;
  sourceUrl: string | null;
  subjectItemId: number | null;
  tags: Array<{ id: number; name: string }>;
  title: string | null;
};

const linkedArticle: MockLinkedItem = {
  author: "Jack Cab",
  commentCount: 0,
  contentMarkdown:
    '## A heading\n\nHere is a paragraph with **bold** text and an [example link](https://example.com).\n\n```rust\nfn main() {\n    println!("hello");\n}\n```',
  contentText: "A heading. Here is a paragraph...",
  digestOptIn: false,
  externalId: "https://jack.cab/blog/every-firefox-extension",
  id: 2,
  ingestedAt: "2026-04-09T07:30:00.000Z",
  latestExtractionStatus: "success",
  metadata: { siteName: "Jack Cab", wordCount: 1234 },
  snapshotCount: 1,
  sourceCreatedAt: "2026-04-08T10:00:00.000Z",
  sourceType: "webpage",
  sourceUrl: "https://jack.cab/blog/every-firefox-extension",
  subjectItemId: 1,
  tags: [],
  title: "Every Firefox Extension",
};

const detailItem: MockItem = {
  author: "normanvalentine",
  commentCount: 2,
  comments: [
    {
      author: "dang",
      contentText: "Top-level comment about the article.",
      externalId: "c-100",
      id: 100,
      metadata: { points: 42 },
      parentExternalId: null,
      path: "n0001",
      sourceCreatedAt: null,
    },
    {
      author: "patio11",
      contentText: "A nested reply with more thoughts.",
      externalId: "c-101",
      id: 101,
      metadata: { points: 7 },
      parentExternalId: "c-100",
      path: "n0001.n0001",
      sourceCreatedAt: null,
    },
  ],
  contentMarkdown: null,
  contentText: null,
  digestOptIn: false,
  linkedItem: linkedArticle,
  externalId: "47730194",
  extractions: [],
  id: 1,
  ingestedAt: "2026-04-10T12:00:00.000Z",
  latestExtractionStatus: "success",
  metadata: { points: 1133 },
  snapshotCount: 1,
  snapshots: [],
  sourceCreatedAt: "2026-04-09T08:00:00.000Z",
  sourceType: "hacker_news_post",
  sourceUrl: "https://news.ycombinator.com/item?id=47730194",
  subjectItemId: null,
  tags: [{ id: 1, name: "firefox" }],
  title: "Filing the corners off my MacBooks",
};

const { useQueryMock, mutateDigestOptIn, mutateReextract } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  mutateDigestOptIn: vi.fn().mockResolvedValue({ digestOptIn: true, id: 1 }),
  mutateReextract: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/trpc/react", () => {
  const mutationStub = () => ({
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ id: 0, name: "stub" }),
  });
  return {
    trpc: {
      useUtils: () => ({
        ingest: {
          get: { invalidate: vi.fn() },
          list: { invalidate: vi.fn() },
        },
        tags: { list: { invalidate: vi.fn() } },
      }),
      ingest: {
        get: {
          useQuery: (...args: unknown[]) => useQueryMock(...args),
        },
        setDigestOptIn: {
          useMutation: () => ({
            isPending: false,
            mutate: vi.fn(),
            mutateAsync: mutateDigestOptIn,
          }),
        },
        reextract: {
          useMutation: () => ({
            isPending: false,
            mutate: vi.fn(),
            mutateAsync: mutateReextract,
          }),
        },
      },
      tags: {
        list: {
          useQuery: () => ({
            data: { tags: [{ id: 1, name: "firefox" }] },
            error: null,
            isLoading: false,
          }),
        },
        addToItem: { useMutation: mutationStub },
        removeFromItem: { useMutation: mutationStub },
        create: { useMutation: mutationStub },
      },
    },
  };
});

describe("ReaderPage", () => {
  beforeEach(() => {
    mutateDigestOptIn.mockClear();
    mutateReextract.mockReset();
    mutateReextract.mockResolvedValue({
      applied: true,
      extractionId: 9,
      ingestor: "generic",
      itemId: 2,
      snapshotId: 41,
      snapshotsExtracted: 1,
      status: "success",
    });
  });

  test("renders an HN thread with its linked article body and comments", () => {
    useQueryMock.mockReturnValue({
      data: { item: detailItem },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Filing the corners off my MacBooks",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "A heading" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Top-level comment about the article."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A nested reply with more thoughts."),
    ).toBeInTheDocument();
    expect(screen.getByText("dang")).toBeInTheDocument();
    expect(screen.getByText("patio11")).toBeInTheDocument();
  });

  test("hides the comments pane when the item has no comments", () => {
    useQueryMock.mockReturnValue({
      data: {
        item: { ...detailItem, comments: [] },
      },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Filing the corners off my MacBooks",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("dang")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Comments ·/)).not.toBeInTheDocument();
  });

  test("falls back to plain contentText when contentMarkdown is null", () => {
    useQueryMock.mockReturnValue({
      data: {
        item: {
          ...detailItem,
          contentMarkdown: null,
          contentText: "Just some plain text without markdown.",
          linkedItem: null,
          comments: [],
          sourceType: "webpage",
        },
      },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    expect(
      screen.getByText("Just some plain text without markdown."),
    ).toBeInTheDocument();
  });

  test("shows the self-post excerpt for a thread with no linked article", () => {
    const selfPost: MockItem = {
      ...detailItem,
      contentMarkdown: null,
      contentText: "A question I've been chewing on for months.",
      linkedItem: null,
      sourceType: "hacker_news_post",
      title: "Ask HN: How do you stay sane?",
      comments: [
        {
          author: "normanvalentine",
          contentText: "Original poster's comment on their own thread.",
          externalId: "c-1",
          id: 1,
          metadata: { points: 99 },
          parentExternalId: null,
          path: "n0001",
          sourceCreatedAt: null,
        },
      ],
    };

    useQueryMock.mockReturnValue({
      data: { item: selfPost },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    expect(screen.getByText("normanvalentine")).toBeInTheDocument();
    expect(
      screen.getByText("Original poster's comment on their own thread."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A question I've been chewing on/),
    ).toBeInTheDocument();
  });

  test("enrolling an item in the digest sends the opposite of its current state", () => {
    useQueryMock.mockReturnValue({
      data: { item: { ...detailItem, digestOptIn: false } },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    const toggle = screen.getByRole("switch", {
      name: "Include in weekly digest",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    expect(mutateDigestOptIn).toHaveBeenCalledWith({
      digestOptIn: true,
      id: 1,
    });
  });

  test("an already-enrolled item offers to remove itself from the digest", () => {
    useQueryMock.mockReturnValue({
      data: { item: { ...detailItem, digestOptIn: true } },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    const toggle = screen.getByRole("switch", {
      name: "Exclude from weekly digest",
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);

    expect(mutateDigestOptIn).toHaveBeenCalledWith({
      digestOptIn: false,
      id: 1,
    });
  });

  test("re-extract targets the linked article, which is the body on screen", async () => {
    useQueryMock.mockReturnValue({
      data: { item: detailItem },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    fireEvent.click(screen.getByRole("button", { name: "Re-extract" }));

    // The thread is item 1; the article body rendered under it is item 2.
    // Re-extracting the thread would leave the visible content untouched.
    expect(mutateReextract).toHaveBeenCalledWith({ id: 2 });
    expect(
      await screen.findByRole("button", { name: "Re-extracted" }),
    ).toBeInTheDocument();
  });

  test("re-extract targets the item itself when there is no linked article", () => {
    useQueryMock.mockReturnValue({
      data: { item: { ...detailItem, linkedItem: null } },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    fireEvent.click(screen.getByRole("button", { name: "Re-extract" }));

    expect(mutateReextract).toHaveBeenCalledWith({ id: 1 });
  });

  test("says so when every snapshot failed and the content was kept", async () => {
    mutateReextract.mockResolvedValue({
      applied: false,
      extractionId: 9,
      ingestor: "generic",
      itemId: 2,
      snapshotId: null,
      snapshotsExtracted: 1,
      status: "failed",
    });
    useQueryMock.mockReturnValue({
      data: { item: detailItem },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    fireEvent.click(screen.getByRole("button", { name: "Re-extract" }));

    expect(
      await screen.findByRole("button", { name: "Nothing extracted" }),
    ).toBeInTheDocument();
  });

  test("surfaces a failed request instead of looking like it worked", async () => {
    mutateReextract.mockRejectedValue(new Error("boom"));
    useQueryMock.mockReturnValue({
      data: { item: detailItem },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    fireEvent.click(screen.getByRole("button", { name: "Re-extract" }));

    expect(
      await screen.findByRole("button", { name: "Re-extract failed" }),
    ).toBeInTheDocument();
  });
});
