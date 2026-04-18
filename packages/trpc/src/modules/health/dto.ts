import { z } from "zod";

export const HealthCheckOutput = z.object({
  ok: z.boolean(),
  requestId: z.string(),
  service: z.literal("@repo/api"),
  timestamp: z.string(),
  database: z.object({
    configured: z.boolean(),
    reachable: z.boolean(),
    error: z.string().nullable(),
  }),
  websockets: z.object({
    enabled: z.boolean(),
  }),
});

export type HealthCheckOutputDTO = z.infer<typeof HealthCheckOutput>;
