"use client";

import type { AppRouter } from "@repo/trpc/types";
import { createTRPCReact } from "@trpc/react-query";

export const trpc = createTRPCReact<AppRouter>();
