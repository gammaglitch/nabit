"use client";

import { useCallback } from "react";
import { trpc } from "@/lib/trpc/react";

export type Tag = { id: number; name: string };

export function useTagOperations() {
  const utils = trpc.useUtils();

  const invalidate = useCallback(async () => {
    await Promise.all([
      utils.ingest.list.invalidate(),
      utils.ingest.get.invalidate(),
      utils.tags.list.invalidate(),
    ]);
  }, [utils]);

  const addToItem = trpc.tags.addToItem.useMutation({
    onSuccess: invalidate,
  });
  const removeFromItem = trpc.tags.removeFromItem.useMutation({
    onSuccess: invalidate,
  });
  const createTag = trpc.tags.create.useMutation();

  const addTag = useCallback(
    async (itemId: number, tagName: string, allTags: Tag[]) => {
      const existing = allTags.find(
        (t) => t.name.toLowerCase() === tagName.toLowerCase(),
      );
      const tag = existing ?? (await createTag.mutateAsync({ name: tagName }));
      await addToItem.mutateAsync({ itemId, tagId: tag.id });
    },
    [createTag, addToItem],
  );

  const removeTag = useCallback(
    async (itemId: number, tagId: number) => {
      await removeFromItem.mutateAsync({ itemId, tagId });
    },
    [removeFromItem],
  );

  return { addTag, removeTag };
}
