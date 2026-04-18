import { z } from "zod";

export const TagOutput = z.object({
  id: z.number(),
  name: z.string(),
});

export const TagListOutput = z.object({
  tags: z.array(TagOutput),
});

export const CreateTagInput = z.object({
  name: z.string().min(1).max(100),
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

export const RemoveTagFromItemInput = z.object({
  itemId: z.number(),
  tagId: z.number(),
});

export const RemoveTagFromItemOutput = z.object({
  removed: z.boolean(),
});

export type TagOutputDTO = z.infer<typeof TagOutput>;
export type TagListOutputDTO = z.infer<typeof TagListOutput>;
export type CreateTagInputDTO = z.infer<typeof CreateTagInput>;
export type CreateTagOutputDTO = z.infer<typeof CreateTagOutput>;
export type DeleteTagInputDTO = z.infer<typeof DeleteTagInput>;
export type DeleteTagOutputDTO = z.infer<typeof DeleteTagOutput>;
export type AddTagToItemInputDTO = z.infer<typeof AddTagToItemInput>;
export type AddTagToItemOutputDTO = z.infer<typeof AddTagToItemOutput>;
export type RemoveTagFromItemInputDTO = z.infer<typeof RemoveTagFromItemInput>;
export type RemoveTagFromItemOutputDTO = z.infer<
  typeof RemoveTagFromItemOutput
>;
