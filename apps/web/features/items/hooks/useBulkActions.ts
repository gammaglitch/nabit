"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/react";
import type { Tag } from "./useTagOperations";

/**
 * The bulk counterparts to `useDeleteItem` and `useTagOperations`.
 *
 * These exist rather than looping the single-item mutations because those
 * invalidate on every success: tagging forty items through `addTag` would fire
 * a hundred and twenty invalidations and refetch the list forty times over.
 * One round trip, one invalidation pass at the end.
 *
 * `ingest.get` is reset per id rather than invalidated, for the reason spelled
 * out at length in `useDeleteItem` — a refetch of a deleted row retries three
 * times against a 404 and strands the caller.
 */
export function useBulkActions() {
  const utils = trpc.useUtils();

  const deleteManyMutation = trpc.ingest.deleteMany.useMutation({
    onSuccess: async (_result, variables) => {
      for (const id of variables.ids) {
        utils.ingest.get.reset({ id });
      }
      await Promise.all([
        utils.ingest.list.invalidate(),
        utils.crawl.list.invalidate(),
        utils.crawl.get.invalidate(),
      ]);
    },
  });

  const addTagToItemsMutation = trpc.tags.addToItems.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.ingest.list.invalidate(),
        utils.ingest.get.invalidate(),
        utils.tags.list.invalidate(),
      ]);
    },
  });

  const createTag = trpc.tags.create.useMutation();

  const deleteMany = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return { deleted: 0 };
      return deleteManyMutation.mutateAsync({ ids });
    },
    [deleteManyMutation],
  );

  /**
   * Resolves the tag by name first so the bulk apply works with a name the
   * user just typed, matching how `useTagOperations.addTag` treats one item.
   */
  const tagMany = useCallback(
    async (itemIds: number[], tagName: string, allTags: Tag[]) => {
      if (itemIds.length === 0) return { added: 0 };
      const existing = allTags.find(
        (t) => t.name.toLowerCase() === tagName.trim().toLowerCase(),
      );
      const tag =
        existing ?? (await createTag.mutateAsync({ name: tagName.trim() }));
      return addTagToItemsMutation.mutateAsync({ itemIds, tagId: tag.id });
    },
    [addTagToItemsMutation, createTag],
  );

  return {
    deleteMany,
    isDeleting: deleteManyMutation.isPending,
    isTagging: addTagToItemsMutation.isPending || createTag.isPending,
    tagMany,
  };
}
