import type { TrpcServices } from "@repo/trpc";

export type HealthCheckInput = Parameters<TrpcServices["health"]["check"]>[0];
export type HealthCheckResult = Awaited<
  ReturnType<TrpcServices["health"]["check"]>
>;
