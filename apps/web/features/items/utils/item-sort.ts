import { timeAgo } from "@/features/shared/utils/source";
import type { DisplayItem } from "./item-helpers";

export type SortField =
  | "added"
  | "updated"
  | "published"
  | "title"
  | "score"
  | "comments";

export type SortDirection = "asc" | "desc";

export type SortSpec = {
  field: SortField;
  direction: SortDirection;
};

type SortFieldMeta = {
  id: SortField;
  label: string;
  hint: string;
  // The direction a field is most useful in when you first pick it: newest
  // first for dates, biggest first for counts, A→Z for text.
  defaultDirection: SortDirection;
  ascLabel: string;
  descLabel: string;
};

export const SORT_FIELDS: readonly SortFieldMeta[] = [
  {
    id: "added",
    label: "Date added",
    hint: "when it landed in the archive",
    defaultDirection: "desc",
    ascLabel: "Oldest first",
    descLabel: "Newest first",
  },
  {
    id: "updated",
    label: "Last updated",
    hint: "when the body or comments last changed",
    defaultDirection: "desc",
    ascLabel: "Stalest first",
    descLabel: "Freshest first",
  },
  {
    id: "published",
    label: "Date published",
    hint: "the source's own date, where it has one",
    defaultDirection: "desc",
    ascLabel: "Oldest first",
    descLabel: "Newest first",
  },
  {
    id: "title",
    label: "Title",
    hint: "alphabetical, numbers in numeric order",
    defaultDirection: "asc",
    ascLabel: "A → Z",
    descLabel: "Z → A",
  },
  {
    id: "score",
    label: "Score",
    hint: "HN points / reddit upvotes",
    defaultDirection: "desc",
    ascLabel: "Lowest first",
    descLabel: "Highest first",
  },
  {
    id: "comments",
    label: "Comments",
    hint: "how many comments were archived",
    defaultDirection: "desc",
    ascLabel: "Fewest first",
    descLabel: "Most first",
  },
];

export const DEFAULT_SORT: SortSpec = { field: "added", direction: "desc" };

export function sortFieldMeta(field: SortField): SortFieldMeta {
  return SORT_FIELDS.find((f) => f.id === field) ?? SORT_FIELDS[0];
}

/** The label for the direction a spec is currently in, e.g. "Newest first". */
export function directionLabel(sort: SortSpec): string {
  const meta = sortFieldMeta(sort.field);
  return sort.direction === "asc" ? meta.ascLabel : meta.descLabel;
}

/**
 * Only a subset of the sort fields is populated on every item: a plain article
 * has no score, and plenty of pages publish no date at all. Those items are
 * not "smallest", they are unknown — sorting them as zero would bury real
 * results under a wall of blanks the moment you flip direction. `null` here
 * means "no value", and `sortItems` pins those to the bottom either way.
 */
function sortValue(
  item: DisplayItem,
  field: SortField,
): number | string | null {
  switch (field) {
    case "added":
      return item.savedAt;
    case "updated":
      return item.updatedAt;
    case "published":
      return item.publishedAt;
    case "title": {
      const title = item.title.trim();
      return title.length > 0 ? title : null;
    }
    case "score":
      return item.score;
    case "comments":
      return item.commentCount;
  }
}

export function sortItems(
  items: readonly DisplayItem[],
  sort: SortSpec,
): DisplayItem[] {
  const direction = sort.direction === "asc" ? 1 : -1;

  return [...items].sort((a, b) => {
    const av = sortValue(a, sort.field);
    const bv = sortValue(b, sort.field);

    // Unknown values sink, in both directions — see `sortValue`.
    if (av === null || bv === null) {
      if (av === bv) return b.id - a.id;
      return av === null ? 1 : -1;
    }

    const cmp =
      typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        : (av as number) - (bv as number);

    // Ties break on id, newest row first, so equal scores and same-second
    // ingests hold a stable order instead of whatever the query happened to
    // return. Deliberately not flipped by `direction`: the tiebreak is there
    // to be predictable, not to be part of the ordering the user picked.
    return cmp !== 0 ? cmp * direction : b.id - a.id;
  });
}

/**
 * The timestamp a row shows while a given sort is active. A list ordered by
 * publication date but stamped with the date added reads as unsorted, which is
 * the confusion this whole control exists to clear up — so the stamp follows
 * the field. Non-date fields keep the date added, the archive's own clock.
 */
export function sortStamp(
  item: DisplayItem,
  field: SortField,
): { text: string; title: string } {
  const added = `added ${new Date(item.savedAt).toISOString().slice(0, 10)}`;

  if (field === "published") {
    return {
      text: stampText("pub", item.publishedAt),
      title:
        item.publishedAt === null
          ? `no publication date · ${added}`
          : `published ${new Date(item.publishedAt).toISOString().slice(0, 10)} · ${added}`,
    };
  }

  if (field === "updated") {
    return {
      text: stampText("upd", item.updatedAt),
      title:
        item.updatedAt === null
          ? `never updated since capture · ${added}`
          : `body or comments last changed ${new Date(item.updatedAt).toISOString().slice(0, 10)} · ${added}`,
    };
  }

  return { text: timeAgo(item.savedAt), title: added };
}

// A prefix on its own would read as a label with a missing value, so an item
// the field does not apply to gets a dash instead.
function stampText(prefix: string, value: number | null): string {
  return value === null ? "—" : `${prefix} ${timeAgo(value)}`;
}
