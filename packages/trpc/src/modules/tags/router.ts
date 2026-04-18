import { router } from "../../lib/trpc/core";
import { authedProcedure } from "../../lib/trpc/middlewares";
import {
  AddTagToItemInput,
  AddTagToItemOutput,
  CreateTagInput,
  CreateTagOutput,
  DeleteTagInput,
  DeleteTagOutput,
  RemoveTagFromItemInput,
  RemoveTagFromItemOutput,
  TagListOutput,
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
  removeFromItem: authedProcedure
    .input(RemoveTagFromItemInput)
    .output(RemoveTagFromItemOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.tags.removeFromItem(input);
    }),
});
