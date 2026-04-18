import type { TrpcServices } from "@repo/trpc";

export type IngestInput = Parameters<TrpcServices["ingest"]["ingest"]>[0];
export type IngestResult = Awaited<
  ReturnType<TrpcServices["ingest"]["ingest"]>
>;
