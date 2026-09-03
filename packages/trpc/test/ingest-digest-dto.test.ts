import { describe, expect, test } from "bun:test";
import {
  EnqueueIngestInput,
  SetDigestOptInInput,
} from "../src/modules/ingest/dto";

describe("@repo/trpc digest opt-in DTOs", () => {
  test("enqueue accepts the digest flag", () => {
    const parsed = EnqueueIngestInput.parse({
      digestOptIn: true,
      url: "https://example.com/article",
    });

    expect(parsed.digestOptIn).toBe(true);
  });

  test("enqueue leaves the flag undefined when omitted", () => {
    const parsed = EnqueueIngestInput.parse({
      url: "https://example.com/article",
    });

    // Deliberately not defaulted in the schema: the single `?? false` lives in
    // IngestService.enqueue so the REST paths, which never touch this schema,
    // get the same answer. A default here would hide that.
    expect(parsed.digestOptIn).toBeUndefined();
  });

  test("enqueue rejects a non-boolean flag", () => {
    const result = EnqueueIngestInput.safeParse({
      digestOptIn: "yes",
      url: "https://example.com/article",
    });

    expect(result.success).toBe(false);
  });

  test("the toggle requires both an item id and an explicit state", () => {
    expect(SetDigestOptInInput.parse({ digestOptIn: false, id: 7 })).toEqual({
      digestOptIn: false,
      id: 7,
    });

    // No implicit toggle: the caller states the state it wants, so a retry or
    // a double-click cannot flip the item back.
    expect(SetDigestOptInInput.safeParse({ id: 7 }).success).toBe(false);
  });
});
