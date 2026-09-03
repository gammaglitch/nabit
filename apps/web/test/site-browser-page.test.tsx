import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import SiteBrowserPage from "@/features/sites/screens/SiteBrowserPage";

const replaceMock = vi.fn();
const pushMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => searchParams,
}));

type PageRow = {
  depth: number;
  discoveryIndex: number;
  errorMessage: string | null;
  id: number;
  isExternal: boolean;
  isLeaf: boolean;
  isRoot: boolean;
  itemId: number | null;
  parentPageId: number | null;
  sourceType: string | null;
  status: string;
  title: string | null;
  url: string;
};

function row(overrides: Partial<PageRow> & { id: number }): PageRow {
  return {
    depth: 0,
    discoveryIndex: 0,
    errorMessage: null,
    isExternal: false,
    isLeaf: false,
    isRoot: false,
    itemId: overrides.id * 10,
    parentPageId: null,
    sourceType: "article",
    status: "done",
    title: null,
    url: `https://docs.site.com/p${overrides.id}`,
    ...overrides,
  };
}

const crawl = {
  createdAt: "2026-09-01T10:00:00.000Z",
  errorMessage: null,
  excludePattern: null,
  finishedAt: "2026-09-01T10:04:00.000Z",
  followExternal: false,
  id: 3,
  includePattern: null,
  label: "Widget Handbook",
  maxDepth: 3,
  maxPages: 200,
  pagesDone: 3,
  pagesFailed: 0,
  pagesQueued: 0,
  pathPrefix: null,
  rootItemId: 10,
  rootUrl: "https://docs.site.com/guide",
  scope: "host" as const,
  status: "done",
  updatedAt: "2026-09-01T10:04:00.000Z",
};

let crawlData: { crawl: typeof crawl; pages: PageRow[] } | undefined = {
  crawl,
  pages: [
    row({ id: 1, isRoot: true, title: "Handbook" }),
    row({ depth: 1, id: 2, parentPageId: 1, title: "Installing" }),
    row({ depth: 1, id: 3, parentPageId: 1, title: "Configuring" }),
    row({
      depth: 1,
      errorMessage: "Disallowed by robots.txt",
      id: 4,
      itemId: null,
      parentPageId: 1,
      status: "skipped",
      title: null,
      url: "https://docs.site.com/private",
    }),
  ],
};

vi.mock("@/lib/trpc/react", () => ({
  trpc: {
    crawl: {
      cancel: {
        useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
      },
      delete: {
        useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
      },
      get: {
        useQuery: () => ({
          data: crawlData,
          error: null,
          isLoading: false,
        }),
      },
      list: {
        useQuery: () => ({ data: { crawls: [crawl] }, isLoading: false }),
      },
      start: {
        useMutation: () => ({
          error: null,
          isPending: false,
          mutateAsync: vi.fn(),
        }),
      },
    },
    ingest: {
      get: {
        useQuery: ({ id }: { id: number }) => ({
          data:
            id > 0
              ? {
                  item: {
                    contentMarkdown: `# Body of item ${id}`,
                    contentText: null,
                  },
                }
              : undefined,
          isLoading: false,
        }),
      },
    },
    useUtils: () => ({
      crawl: {
        get: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
      },
      ingest: { list: { invalidate: vi.fn() } },
    }),
  },
}));

describe("SiteBrowserPage", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    replaceMock.mockClear();
    pushMock.mockClear();
  });

  test("renders the site tree in discovery order", () => {
    render(<SiteBrowserPage id={3} />);

    expect(screen.getByText("Widget Handbook")).toBeTruthy();

    // Scoped to the tree: the selected page's title also appears as the
    // article heading in the reading pane.
    const tree = within(screen.getByRole("navigation"));
    // Excludes the expand/collapse chevrons, which are buttons too.
    const labels = tree
      .getAllByRole("button")
      .filter((button) => !button.getAttribute("aria-label"))
      .map((button) => button.textContent?.trim());
    expect(labels).toEqual([
      "Handbook",
      "Installing",
      "Configuring",
      "private",
    ]);
  });

  test("falls back to the root page when the url names none", () => {
    render(<SiteBrowserPage id={3} />);

    // Root item id is 1 * 10, so the reading pane shows its body.
    expect(screen.getByText("Body of item 10")).toBeTruthy();
  });

  test("reads the selected page out of the url", () => {
    searchParams = new URLSearchParams("page=3");
    render(<SiteBrowserPage id={3} />);

    expect(screen.getByText("Body of item 30")).toBeTruthy();
  });

  test("selecting a page puts it in the url so it can be linked", () => {
    render(<SiteBrowserPage id={3} />);

    const tree = within(screen.getByRole("navigation"));
    fireEvent.click(tree.getByText("Installing"));

    expect(replaceMock).toHaveBeenCalledWith("/sites/3?page=2", {
      scroll: false,
    });
  });

  test("a skipped page is shown but cannot be opened", () => {
    render(<SiteBrowserPage id={3} />);

    // Labelled from its URL since it never got a title, and disabled because
    // there is nothing archived behind it.
    const tree = within(screen.getByRole("navigation"));
    const skipped = tree.getByText("private") as HTMLButtonElement;
    expect(skipped.disabled).toBe(true);
    expect(skipped.title).toBe("Disallowed by robots.txt");
  });

  test("says so when a finished crawl archived nothing", () => {
    crawlData = { crawl: { ...crawl, pagesDone: 0 }, pages: [] };
    render(<SiteBrowserPage id={3} />);

    expect(screen.getByText(/no readable pages/i)).toBeTruthy();

    crawlData = {
      crawl,
      pages: [row({ id: 1, isRoot: true, title: "Handbook" })],
    };
  });

  test("rejects a nonsense site id", () => {
    render(<SiteBrowserPage id={0} />);
    expect(screen.getByText("[INVALID SITE ID]")).toBeTruthy();
  });
});
