import { router } from "../../lib/trpc/core";
import { authedProcedure } from "../../lib/trpc/middlewares";
import {
  ChatSettingsOutput,
  UpdateChatSettingsInput,
  UpdateChatSettingsOutput,
} from "./dto";

export const settingsRouter = router({
  get: authedProcedure.output(ChatSettingsOutput).query(async ({ ctx }) => {
    return ctx.services.settings.get();
  }),
  update: authedProcedure
    .input(UpdateChatSettingsInput)
    .output(UpdateChatSettingsOutput)
    .mutation(async ({ ctx, input }) => {
      return ctx.services.settings.update(input);
    }),
});
