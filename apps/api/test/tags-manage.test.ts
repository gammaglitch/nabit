import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { itemsTable, itemTagsTable, tagsTable } from "../src/db/schema";
import { TagService } from "../src/modules/tags/service";

// Renames and the usage counts are SQL, so they are checked against a real
// Postgres. See test/tag-runs.test.ts for how to start a throwaway one.
const url = process.env.TEST_DATABASE_URL;
const client = url ? postgres(url, { max: 1, prepare: false }) : null;
const db = client ? drizzle({ client }) : null;
const database = { configured: Boolean(db), db };
const describeWithDb = url ? describe : describe.skip;

describeWithDb("TagService against Postgres", () => {
  const service = new TagService(database);

  beforeEach(async () => {
    await db?.delete(itemTagsTable);
    await db?.delete(itemsTable);
    await db?.delete(tagsTable);
  });

  afterAll(async () => {
    await client?.end();
  });

  test("creates a tag with its description, lowercased", async () => {
    const created = await service.create({
      description: "  The programming language.  ",
      name: "  Rust  ",
    });

    expect(created).toMatchObject({
      description: "The programming language.",
      name: "rust",
    });
  });

  test("lists tags with how many items carry them", async () => {
    const rust = await service.create({ name: "rust" });
    await service.create({ name: "unused" });
    const [item] =
      (await db
        ?.insert(itemsTable)
        .values({ sourceType: "web", title: "A post" })
        .returning()) ?? [];
    await service.addToItem({ itemId: item?.id ?? 0, tagId: rust?.id ?? 0 });

    expect((await service.list()).tags).toEqual([
      { description: null, id: rust?.id ?? 0, itemCount: 1, name: "rust" },
      expect.objectContaining({ itemCount: 0, name: "unused" }),
    ]);
  });

  test("a rename keeps the tag on every item that carries it", async () => {
    const tag = await service.create({ name: "rust", description: "Lang." });
    const [item] =
      (await db
        ?.insert(itemsTable)
        .values({ sourceType: "web", title: "A post" })
        .returning()) ?? [];
    await service.addToItem({ itemId: item?.id ?? 0, tagId: tag?.id ?? 0 });

    const renamed = await service.update({
      id: tag?.id ?? 0,
      name: "Rust-Lang",
    });

    // Lowercased like a created one, and the description is left alone.
    expect(renamed).toMatchObject({ description: "Lang.", name: "rust-lang" });
    expect((await service.list()).tags[0]?.itemCount).toBe(1);
  });

  test("refuses a rename onto a name already taken", async () => {
    const rust = await service.create({ name: "rust" });
    await service.create({ name: "woodworking" });

    await expect(
      service.update({ id: rust?.id ?? 0, name: "WOODWORKING" }),
    ).rejects.toThrow("A tag called #woodworking already exists.");

    // Renaming a tag to what it is already called is not a conflict.
    expect(
      await service.update({ id: rust?.id ?? 0, name: "rust" }),
    ).toMatchObject({ name: "rust" });
  });

  test("clears a description back to nothing", async () => {
    const tag = await service.create({ description: "Lang.", name: "rust" });

    expect(
      await service.update({ description: "   ", id: tag?.id ?? 0 }),
    ).toMatchObject({ description: null, name: "rust" });
  });

  test("rejects a blank name and an unknown tag", async () => {
    const tag = await service.create({ name: "rust" });

    await expect(
      service.update({ id: tag?.id ?? 0, name: "   " }),
    ).rejects.toThrow("A tag needs a name.");
    await expect(service.update({ id: 987654, name: "x" })).rejects.toThrow(
      "No tag with id 987654",
    );
  });
});
