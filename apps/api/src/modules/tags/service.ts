import type { TrpcServices } from "@repo/trpc";
import { TRPCError } from "@trpc/server";
import { and, count, eq, ne } from "drizzle-orm";
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

/** Tags are matched and displayed lowercase, so #Rust and #rust are one tag. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase();
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
    const rows = await db
      .select({
        description: tagsTable.description,
        id: tagsTable.id,
        itemCount: count(itemTagsTable.itemId),
        name: tagsTable.name,
      })
      .from(tagsTable)
      .leftJoin(itemTagsTable, eq(itemTagsTable.tagId, tagsTable.id))
      .groupBy(tagsTable.id, tagsTable.name, tagsTable.description)
      .orderBy(tagsTable.name);

    return { tags: rows };
  }

  async create(input: { description?: string | null; name: string }) {
    const db = requireDatabase(this.database);
    const normalized = normalizeName(input.name);

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

  /**
   * Renames a tag and/or rewrites what it means. Both are edits to the tag
   * itself, so every item keeps it — unlike deleting and re-creating, which
   * would drop it from everything.
   */
  async update(input: {
    description?: string | null;
    id: number;
    name?: string;
  }) {
    const db = requireDatabase(this.database);
    const name =
      input.name === undefined ? undefined : normalizeName(input.name);

    if (name !== undefined) {
      if (name.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A tag needs a name.",
        });
      }
      // Checked rather than left to the unique index so the message names the
      // conflict; merging two tags is a different operation.
      const [clash] = await db
        .select({ id: tagsTable.id })
        .from(tagsTable)
        .where(and(eq(tagsTable.name, name), ne(tagsTable.id, input.id)))
        .limit(1);
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A tag called #${name} already exists.`,
        });
      }
    }

    const [updated] = await db
      .update(tagsTable)
      .set({
        ...(name === undefined ? {} : { name }),
        ...(input.description === undefined
          ? {}
          : { description: cleanDescription(input.description) }),
      })
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
