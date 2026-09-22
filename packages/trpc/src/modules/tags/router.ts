import { router } from "../../lib/trpc/core";
import { authedProcedure } from "../../lib/trpc/middlewares";
import {
  AddTagToItemInput,
  AddTagToItemOutput,
  AddTagToItemsInput,
  AddTagToItemsOutput,
  CreateTagInput,
  CreateTagOutput,
  DeleteTagInput,
  DeleteTagOutput,
  RemoveTagFromItemInput,
  RemoveTagFromItemOutput,
  TagListOutput,
  UpdateTagInput,
  UpdateTagOutput,
} from "./dto";

export const tagsRouter = router({
  list: authedProcedure.output(TagListOutput).query(async ({ ctx }) => {
    return ctx.services.tags.list();
  }),
  create: authedProcedure
    .input(CreateTagInput)
    .output(CreateTagOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.tags.create(input);
    }),
  update: authedProcedure
    .input(UpdateTagInput)
    .output(UpdateTagOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.tags.update(input);
    }),
  delete: authedProcedure
    .input(DeleteTagInput)
    .output(DeleteTagOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.tags.delete(input);
    }),
  addToItem: authedProcedure
    .input(AddTagToItemInput)
    .output(AddTagToItemOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.tags.addToItem(input);
    }),
  addToItems: authedProcedure
    .input(AddTagToItemsInput)
    .output(AddTagToItemsOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.tags.addToItems(input);
    }),
  removeFromItem: authedProcedure
    .input(RemoveTagFromItemInput)
    .output(RemoveTagFromItemOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.tags.removeFromItem(input);
    }),
});
