import type { TrpcServices } from "@repo/trpc";
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

export class TagService implements TagServiceContract {
  constructor(private readonly database: DatabaseState) {}

  async list() {
    const db = requireDatabase(this.database);
    const rows = await db.select().from(tagsTable).orderBy(tagsTable.name);

    return { tags: rows };
  }

  async create(input: { name: string }) {
    const db = requireDatabase(this.database);
    const normalized = input.name.trim().toLowerCase();

    const [inserted] = await db
      .insert(tagsTable)
      .values({ name: normalized })
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
