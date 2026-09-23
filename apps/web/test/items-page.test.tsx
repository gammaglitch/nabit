import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import ItemsRoute from "@/app/items/page";

const {
  deletedIds,
  routerPush,
  invalidateList,
  invalidateGet,
  invalidateTagsList,
  mutateEnqueue,
} = vi.hoisted(() => ({
  deletedIds: [] as number[],
  routerPush: vi.fn(),
  invalidateList: vi.fn(),
  invalidateGet: vi.fn(),
  invalidateTagsList: vi.fn(),
  mutateEnqueue: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
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
            get: { invalidate: invalidateGet, reset: vi.fn() },
            jobs: { invalidate: vi.fn() },
            list: { invalidate: invalidateList },
          },
          crawl: {
            get: { invalidate: vi.fn() },
            list: { invalidate: vi.fn() },
          },
          tags: { list: { invalidate: invalidateTagsList } },
        };
      },
      crawl: {
        cancel: { useMutation: mutationStub },
        delete: { useMutation: mutationStub },
        list: { useQuery: () => ({ data: { crawls: [] }, isLoading: false }) },
        start: { useMutation: mutationStub },
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
                    contentUpdatedAt: "2026-04-06T10:00:00.000Z",
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
                  {
                    author: "echo",
                    commentCount: 0,
                    contentMarkdown: "Second body.",
                    contentText: "Second body.",
                    contentUpdatedAt: "2026-04-06T10:00:00.000Z",
                    externalId: "https://example.com/second",
                    id: 2,
                    ingestedAt: "2026-04-05T10:00:00.000Z",
                    latestExtractionStatus: "success",
                    metadata: {},
                    snapshotCount: 1,
                    sourceCreatedAt: "2026-04-04T12:00:00.000Z",
                    sourceType: "webpage",
                    sourceUrl: "https://example.com/second",
                    subjectItemId: null,
                    tags: [],
                    title: "Second Story",
                  },
                ],
                total: 2,
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
        delete: { useMutation: mutationStub },
        deleteMany: {
          useMutation: (opts?: {
            onSuccess?: (
              result: { deleted: number },
              variables: { ids: number[] },
            ) => unknown;
          }) => ({
            isPending: false,
            mutate: vi.fn(),
            mutateAsync: vi.fn(async (variables: { ids: number[] }) => {
              const result = { deleted: variables.ids.length };
              await opts?.onSuccess?.(result, variables);
              deletedIds.push(...variables.ids);
              return result;
            }),
          }),
        },
      },
      // The queue watches for a running tagging pass; this page has none.
      tagging: {
        latestRun: {
          useQuery: () => ({ data: { run: null }, error: null }),
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
        addToItems: { useMutation: mutationStub },
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

/**
 * Select mode is a modal state over the same list: while it is on, a click
 * picks a row instead of opening it, and the view picker gives up its slot to
 * the bulk actions. These cover the switches between those two worlds, since
 * getting one wrong means either a lost click or an unreachable reader.
 */
describe("items page select mode", () => {
  beforeEach(() => {
    deletedIds.length = 0;
    routerPush.mockClear();
  });

  const enterSelectMode = () => {
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
  };

  // The dense row is a <button>; the list row is a div[role=button], because
  // it holds nested buttons of its own. Either is "the row" to a click.
  const row = (title: string) => {
    const el = screen.getByText(title).closest('button, [role="button"]');
    if (!el) throw new Error(`no row element for ${title}`);
    return el;
  };

  test("swaps the view picker for the bulk actions", () => {
    render(<ItemsRoute />);

    expect(screen.getByRole("button", { name: "LIST" })).toBeInTheDocument();

    enterSelectMode();

    expect(screen.queryByRole("button", { name: "LIST" })).toBeNull();
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });

  test("a row click selects instead of opening the reader", () => {
    render(<ItemsRoute />);
    enterSelectMode();

    fireEvent.click(row("Archiveable Story"));

    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });

  test("leaving select mode restores opening on click", () => {
    render(<ItemsRoute />);
    enterSelectMode();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    fireEvent.click(row("Archiveable Story"));

    expect(routerPush).toHaveBeenCalledWith("/read/1");
  });

  test("escape leaves select mode and drops the selection", () => {
    render(<ItemsRoute />);
    enterSelectMode();
    fireEvent.click(row("Archiveable Story"));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByRole("button", { name: "LIST" })).toBeInTheDocument();
    expect(screen.queryByText("1 selected")).toBeNull();
  });

  test("shift-click takes the range between the two rows", () => {
    render(<ItemsRoute />);
    enterSelectMode();

    fireEvent.click(row("Archiveable Story"));
    fireEvent.click(row("Second Story"), { shiftKey: true });

    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  test("delete needs a second, count-bearing click before it fires", async () => {
    render(<ItemsRoute />);
    enterSelectMode();
    fireEvent.click(screen.getByRole("button", { name: "All" }));

    expect(screen.getByText("2 selected")).toBeInTheDocument();

    // First click only arms it — nothing has been asked of the server yet.
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(deletedIds).toEqual([]);

    const confirm = await screen.findByRole("button", {
      name: "Delete 2 for good",
    });
    fireEvent.click(confirm);

    await screen.findByText("0 selected");
    expect(deletedIds.toSorted()).toEqual([1, 2]);
  });

  test("changing the selection disarms a primed delete", () => {
    render(<ItemsRoute />);
    enterSelectMode();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(
      screen.getByRole("button", { name: "Delete 2 for good" }),
    ).toBeInTheDocument();

    // Deselect one: the armed button named a count the user can no longer see.
    fireEvent.click(row("Second Story"));

    expect(screen.queryByRole("button", { name: /for good/ })).toBeNull();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });
});

/**
 * The sort control is a menu plus a direction toggle rather than one button
 * per mode, so the two halves have to stay in step: picking a field resets the
 * direction to that field's natural one, and the toggle reverses whatever is
 * selected. `item-sort.test.ts` covers the ordering itself.
 */
describe("items page sorting", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const titles = () =>
    screen
      .getAllByText(/Archiveable Story|Second Story/)
      .map((el) => el.textContent);

  const openMenu = () =>
    fireEvent.click(screen.getByRole("button", { name: /Date added/ }));

  test("defaults to newest added first", () => {
    render(<ItemsRoute />);

    expect(
      screen.getByRole("button", { name: /Date added/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort direction: Newest first" }),
    ).toBeInTheDocument();
    expect(titles()).toEqual(["Second Story", "Archiveable Story"]);
  });

  test("the direction toggle reverses the list", () => {
    render(<ItemsRoute />);

    fireEvent.click(
      screen.getByRole("button", { name: "Sort direction: Newest first" }),
    );

    expect(
      screen.getByRole("button", { name: "Sort direction: Oldest first" }),
    ).toBeInTheDocument();
    expect(titles()).toEqual(["Archiveable Story", "Second Story"]);
  });

  test("picking a field switches to that field's natural direction", () => {
    render(<ItemsRoute />);
    // Reverse first, so a leftover "asc" would be visible in the result.
    fireEvent.click(
      screen.getByRole("button", { name: "Sort direction: Newest first" }),
    );

    openMenu();
    fireEvent.click(screen.getByRole("option", { name: /Title/ }));

    expect(screen.getByRole("button", { name: /Title/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sort direction: A → Z" }),
    ).toBeInTheDocument();
    expect(titles()).toEqual(["Archiveable Story", "Second Story"]);
  });

  test("the menu closes on escape", () => {
    render(<ItemsRoute />);
    openMenu();

    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("the choice survives a remount", () => {
    const first = render(<ItemsRoute />);
    openMenu();
    fireEvent.click(screen.getByRole("option", { name: /Date published/ }));
    first.unmount();

    render(<ItemsRoute />);

    expect(
      screen.getByRole("button", { name: /Date published/ }),
    ).toBeInTheDocument();
  });

  test("a sort mode from an older build falls back to the default", () => {
    window.localStorage.setItem("nabit.sort", "oldest");

    render(<ItemsRoute />);

    expect(
      screen.getByRole("button", { name: /Date added/ }),
    ).toBeInTheDocument();
    expect(titles()).toEqual(["Second Story", "Archiveable Story"]);
  });
});
