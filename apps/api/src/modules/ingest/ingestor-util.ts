// Re-export utilities from @repo/ingestors that the generic ingestor needs.
// These are in the package but not all are in the top-level export — import them here.
export { countWords, firstString, normalizeIsoDate } from "@repo/ingestors";
