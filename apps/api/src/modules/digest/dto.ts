export type DigestStatus =
  | "pending"
  | "processing"
  | "success"
  | "failed"
  | "empty";

export class DigestNotConfiguredError extends Error {
  constructor() {
    super("OPENROUTER_API_KEY is not configured");
    this.name = "DigestNotConfiguredError";
  }
}
