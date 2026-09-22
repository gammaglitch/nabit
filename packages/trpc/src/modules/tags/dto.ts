import { z } from "zod";

export const TagOutput = z.object({
  /**
   * What the tag is for, in the user's words. Jev judges an article against
   * this when suggesting tags, so a name like "rust" can say whether it means
   * the language or the corrosion.
   */
  description: z.string().nullable(),
  id: z.number(),
  name: z.string(),
});

/** The list carries usage so the tag page can show what a change would touch. */
export const TagListItem = TagOutput.extend({
  itemCount: z.number(),
});

export const TagListOutput = z.object({
  tags: z.array(TagListItem),
});

export const CreateTagInput = z.object({
  description: z.string().max(500).nullable().optional(),
  name: z.string().min(1).max(100),
});

export const UpdateTagInput = z.object({
  description: z.string().max(500).nullable().optional(),
  id: z.number(),
  /** Renaming keeps the tag on every item that carries it. */
  name: z.string().min(1).max(100).optional(),
});

export const UpdateTagOutput = TagOutput;

export const SuggestTagsInput = z.object({
  itemId: z.number(),
});

export const SuggestTagsOutput = z.object({
  model: z.string(),
  /** True when the library has more tags than one round could weigh. */
  truncated: z.boolean(),
  /** Tags the item does not already carry, most confident first. */
  suggestions: z.array(
    z.object({
      /** Jev's probability, 0-1, that the tag belongs on this item. */
      confidence: z.number().min(0).max(1),
      description: z.string().nullable(),
      id: z.number(),
      name: z.string(),
    }),
  ),
});

export const CreateTagOutput = TagOutput;

export const DeleteTagInput = z.object({
  id: z.number(),
});

export const DeleteTagOutput = z.object({
  deleted: z.boolean(),
});

export const AddTagToItemInput = z.object({
  itemId: z.number(),
  tagId: z.number(),
});

export const AddTagToItemOutput = z.object({
  added: z.boolean(),
});

export const AddTagToItemsInput = z.object({
  itemIds: z.array(z.number()).min(1).max(500),
  tagId: z.number(),
});

export const AddTagToItemsOutput = z.object({
  added: z.number(),
});

export const RemoveTagFromItemInput = z.object({
  itemId: z.number(),
  tagId: z.number(),
});

export const RemoveTagFromItemOutput = z.object({
  removed: z.boolean(),
});

export type TagOutputDTO = z.infer<typeof TagOutput>;
export type TagListItemDTO = z.infer<typeof TagListItem>;
export type UpdateTagInputDTO = z.infer<typeof UpdateTagInput>;
export type UpdateTagOutputDTO = z.infer<typeof UpdateTagOutput>;
export type SuggestTagsInputDTO = z.infer<typeof SuggestTagsInput>;
export type SuggestTagsOutputDTO = z.infer<typeof SuggestTagsOutput>;
export type TagListOutputDTO = z.infer<typeof TagListOutput>;
export type CreateTagInputDTO = z.infer<typeof CreateTagInput>;
export type CreateTagOutputDTO = z.infer<typeof CreateTagOutput>;
export type DeleteTagInputDTO = z.infer<typeof DeleteTagInput>;
export type DeleteTagOutputDTO = z.infer<typeof DeleteTagOutput>;
export type AddTagToItemInputDTO = z.infer<typeof AddTagToItemInput>;
export type AddTagToItemOutputDTO = z.infer<typeof AddTagToItemOutput>;
export type AddTagToItemsInputDTO = z.infer<typeof AddTagToItemsInput>;
export type AddTagToItemsOutputDTO = z.infer<typeof AddTagToItemsOutput>;
export type RemoveTagFromItemInputDTO = z.infer<typeof RemoveTagFromItemInput>;
export type RemoveTagFromItemOutputDTO = z.infer<
  typeof RemoveTagFromItemOutput
>;
