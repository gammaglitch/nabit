import type { AppRouter, inferRouterOutputs } from "@repo/trpc/types";
import { useMemo } from "react";

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type ItemSummary = RouterOutputs["ingest"]["list"]["items"][number];

export type GroupedItem = {
  /** The primary item to display (article if grouped, otherwise the standalone item) */
  primary: ItemSummary;
  /** Discussion items (HN/Reddit posts) that link to this article via subjectItemId */
  discussions: ItemSummary[];
};

export function useGroupedItems(items: ItemSummary[]): GroupedItem[] {
  return useMemo(() => groupItems(items), [items]);
}

export function groupItems(items: ItemSummary[]): GroupedItem[] {
  // Build a map of subjectItemId -> discussion items
  const discussionsBySubject = new Map<number, ItemSummary[]>();
  const discussionIds = new Set<number>();

  for (const item of items) {
    if (item.subjectItemId !== null) {
      const existing = discussionsBySubject.get(item.subjectItemId) ?? [];
      existing.push(item);
      discussionsBySubject.set(item.subjectItemId, existing);
      discussionIds.add(item.id);
    }
  }

  const groups: GroupedItem[] = [];
  const consumedSubjects = new Set<number>();

  // First pass: create groups for articles that have discussions pointing to them
  for (const item of items) {
    if (discussionIds.has(item.id)) continue; // skip discussion items, they'll be attached

    const discussions = discussionsBySubject.get(item.id);
    if (discussions) {
      consumedSubjects.add(item.id);
      groups.push({ primary: item, discussions });
    } else {
      groups.push({ primary: item, discussions: [] });
    }
  }

  // Second pass: orphaned discussions whose subject article is not in the list
  for (const [subjectId, discussions] of discussionsBySubject) {
    if (consumedSubjects.has(subjectId)) continue;
    // Group orphaned discussions together under the first one as primary
    groups.push({ primary: discussions[0], discussions: discussions.slice(1) });
  }

  return groups;
}
