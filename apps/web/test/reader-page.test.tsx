import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
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

type MockDiscussion = {
  author: string | null;
  commentCount: number;
  comments: MockComment[];
  contentMarkdown: string | null;
  contentText: string | null;
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
  discussions: MockDiscussion[];
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

const detailItem: MockItem = {
  author: "Jack Cab",
  commentCount: 0,
  comments: [],
  contentMarkdown:
    '## A heading\n\nHere is a paragraph with **bold** text and an [example link](https://example.com).\n\n```rust\nfn main() {\n    println!("hello");\n}\n```',
  contentText: "A heading. Here is a paragraph...",
  discussions: [
    {
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
      externalId: "47730194",
      id: 99,
      ingestedAt: "2026-04-10T12:00:00.000Z",
      latestExtractionStatus: "success",
      metadata: { points: 1133 },
      snapshotCount: 1,
      sourceCreatedAt: "2026-04-09T08:00:00.000Z",
      sourceType: "hacker_news_post",
      sourceUrl: "https://news.ycombinator.com/item?id=47730194",
      subjectItemId: 1,
      tags: [],
      title: "Filing the corners off my MacBooks",
    },
  ],
  externalId: "https://jack.cab/blog/every-firefox-extension",
  extractions: [],
  id: 1,
  ingestedAt: "2026-04-09T07:30:00.000Z",
  latestExtractionStatus: "success",
  metadata: { siteName: "Jack Cab", wordCount: 1234 },
  snapshotCount: 1,
  snapshots: [],
  sourceCreatedAt: "2026-04-08T10:00:00.000Z",
  sourceType: "webpage",
  sourceUrl: "https://jack.cab/blog/every-firefox-extension",
  subjectItemId: null,
  tags: [{ id: 1, name: "firefox" }],
  title: "Every Firefox Extension",
};

const useQueryMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    ingest: {
      get: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

describe("ReaderPage", () => {
  test("renders the article markdown plus inline discussion comments", () => {
    useQueryMock.mockReturnValue({
      data: { item: detailItem },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Every Firefox Extension",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "A heading" }),
    ).toBeInTheDocument();
    expect(screen.getByText("DISCUSSED ON")).toBeInTheDocument();
    expect(screen.getByText("HACKER NEWS POST")).toBeInTheDocument();
    expect(screen.getByText("1133 points")).toBeInTheDocument();
    expect(screen.getByText("2 COMMENTS")).toBeInTheDocument();
    expect(screen.getByText("@dang")).toBeInTheDocument();
    expect(
      screen.getByText("Top-level comment about the article."),
    ).toBeInTheDocument();
    expect(screen.getByText("@patio11")).toBeInTheDocument();
    expect(
      screen.getByText("A nested reply with more thoughts."),
    ).toBeInTheDocument();

    const externalLink = screen.getByRole("link", { name: /OPEN ↗/ });
    expect(externalLink).toHaveAttribute(
      "href",
      "https://news.ycombinator.com/item?id=47730194",
    );
    expect(externalLink).toHaveAttribute("target", "_blank");
  });

  test("hides the discussion section when the article has no discussions", () => {
    useQueryMock.mockReturnValue({
      data: { item: { ...detailItem, discussions: [] } },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Every Firefox Extension",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("DISCUSSED ON")).not.toBeInTheDocument();
    expect(screen.queryByText("@dang")).not.toBeInTheDocument();
  });

  test("falls back to plain contentText when contentMarkdown is null", () => {
    useQueryMock.mockReturnValue({
      data: {
        item: {
          ...detailItem,
          contentMarkdown: null,
          contentText: "Just some plain text without markdown.",
          discussions: [],
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

  test("renders the item's own comments when it is itself a discussion", () => {
    const discussionAsItem: MockItem = {
      ...detailItem,
      contentMarkdown: null,
      contentText: null,
      discussions: [],
      sourceType: "hacker_news_post",
      title: "Filing the corners off my MacBooks",
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
      data: { item: discussionAsItem },
      error: null,
      isLoading: false,
    });

    render(<ReaderPage id={1} />);

    expect(
      screen.getByText("[NO ARTICLE CONTENT EXTRACTED]"),
    ).toBeInTheDocument();
    expect(screen.getByText("COMMENTS · 1")).toBeInTheDocument();
    expect(screen.getByText("@normanvalentine")).toBeInTheDocument();
    expect(
      screen.getByText("Original poster's comment on their own thread."),
    ).toBeInTheDocument();
    expect(screen.queryByText("DISCUSSED ON")).not.toBeInTheDocument();
  });
});
