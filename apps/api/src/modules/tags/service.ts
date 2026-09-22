import type { TrpcServices } from "@repo/trpc";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import { itemTagsTable, tagsTable } from "../../db/schema";

type TagServiceContract = TrpcServices["tags"];
type Database = NonNullable<DatabaseState["db"]>;

function requireDatabase(database: DatabaseState): Database {
  if (!database.db) {
    throw new Error("Database not configured");
  }

  return database.db;
}

/** Blank is stored as NULL, so "no description" has one representation. */
function cleanDescription(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export class TagService implements TagServiceContract {
  constructor(private readonly database: DatabaseState) {}

  async list() {
    const db = requireDatabase(this.database);
    const rows = await db.select().from(tagsTable).orderBy(tagsTable.name);

    return { tags: rows };
  }

  async create(input: { description?: string | null; name: string }) {
    const db = requireDatabase(this.database);
    const normalized = input.name.trim().toLowerCase();

    const [inserted] = await db
      .insert(tagsTable)
      .values({
        description: cleanDescription(input.description),
        name: normalized,
      })
      .onConflictDoNothing({ target: tagsTable.name })
      .returning();

    if (inserted) {
      return inserted;
    }

    const [existing] = await db
      .select()
      .from(tagsTable)
      .where(eq(tagsTable.name, normalized))
      .limit(1);

    return existing;
  }

  /** Only the description is editable; renaming a tag is a different job. */
  async update(input: { description: string | null; id: number }) {
    const db = requireDatabase(this.database);
    const [updated] = await db
      .update(tagsTable)
      .set({ description: cleanDescription(input.description) })
      .where(eq(tagsTable.id, input.id))
      .returning();

    if (!updated) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `No tag with id ${input.id}`,
      });
    }

    return updated;
  }

  async delete(input: { id: number }) {
    const db = requireDatabase(this.database);
    const result = await db
      .delete(tagsTable)
      .where(eq(tagsTable.id, input.id))
      .returning({ id: tagsTable.id });

    return { deleted: result.length > 0 };
  }

  async addToItem(input: { itemId: number; tagId: number }) {
    const db = requireDatabase(this.database);
    await db
      .insert(itemTagsTable)
      .values({ itemId: input.itemId, tagId: input.tagId })
      .onConflictDoNothing();

    return { added: true };
  }

  /**
   * Applies one tag to many items in a single insert.
   *
   * `added` counts only the rows that were new. Items that already carried the
   * tag conflict away silently, which is what makes the bulk action safe to
   * repeat over an overlapping selection.
   */
  async addToItems(input: { itemIds: number[]; tagId: number }) {
    const db = requireDatabase(this.database);
    const inserted = await db
      .insert(itemTagsTable)
      .values(input.itemIds.map((itemId) => ({ itemId, tagId: input.tagId })))
      .onConflictDoNothing()
      .returning({ itemId: itemTagsTable.itemId });

    return { added: inserted.length };
  }

  async removeFromItem(input: { itemId: number; tagId: number }) {
    const db = requireDatabase(this.database);
    const result = await db
      .delete(itemTagsTable)
      .where(
        and(
          eq(itemTagsTable.itemId, input.itemId),
          eq(itemTagsTable.tagId, input.tagId),
        ),
      )
      .returning({ itemId: itemTagsTable.itemId });

    return { removed: result.length > 0 };
  }
}
