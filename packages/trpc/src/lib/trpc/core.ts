import { initTRPC } from "@trpc/server";
import type { TrpcContext } from "../../context";

export const trpc = initTRPC.context<TrpcContext>().create();

export const router = trpc.router;
export const publicProcedure = trpc.procedure;
