import { describe, expect, test } from "bun:test";
import { ReextractInput, ReextractOutput } from "../src/modules/ingest/dto";

describe("@repo/trpc re-extract DTOs", () => {
  test("an item id is enough; the ingestor override is optional", () => {
    expect(ReextractInput.parse({ id: 7 })).toEqual({ id: 7 });
    expect(ReextractInput.parse({ id: 7, ingestor: "generic" })).toEqual({
      id: 7,
      ingestor: "generic",
    });
    expect(() => ReextractInput.parse({ id: 7, ingestor: "nope" })).toThrow();
    expect(() => ReextractInput.parse({})).toThrow();
  });

  test("the output survives a run where every snapshot failed", () => {
    // No snapshot won, so there is no winning snapshot id to report and the
    // item keeps its previous content — `applied` is how a caller can tell.
    const parsed = ReextractOutput.parse({
      applied: false,
      extractionId: 91,
      ingestor: "generic",
      itemId: 7,
      snapshotId: null,
      snapshotsExtracted: 1,
      status: "failed",
    });

    expect(parsed.applied).toBe(false);
    expect(parsed.snapshotId).toBeNull();
  });

  test("rejects a run that claims to have extracted nothing at all", () => {
    // reextract throws before this point when an item has no snapshots, so a
    // zero here would mean the service lied about what it did.
    expect(() =>
      ReextractOutput.parse({
        applied: true,
        extractionId: 91,
        ingestor: "generic",
        itemId: 7,
        snapshotId: 41,
        snapshotsExtracted: 0,
        status: "success",
      }),
    ).toThrow();
  });
});
