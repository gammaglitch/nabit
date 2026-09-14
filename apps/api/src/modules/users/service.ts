import { and, eq } from "drizzle-orm";
import type { DatabaseState } from "../../db/client";
import { userIdentitiesTable, usersTable } from "../../db/schema";

type Database = NonNullable<DatabaseState["db"]>;

export type ProviderIdentity = {
  email: string | null;
  provider: string;
  subject: string;
};

type CachedIdentity = {
  email: string | null;
  refreshedAt: number;
  userId: number;
};

// How long a resolved identity is trusted before the next request touches the
// database again. Short enough that `last_seen_at` stays meaningful and an
// email change reaches `users` within minutes; long enough that a page load's
// burst of parallel tRPC calls does not become a burst of writes.
const REFRESH_MS = 10 * 60_000;

/**
 * Turns an authenticated provider account into a nabit user id, creating the
 * user on first sight.
 *
 * Provisioning is just-in-time rather than an invite step: ALLOWED_EMAILS
 * already decides who may log in, and the auth plugin only calls this for a
 * caller that passed it, so a row here means someone was actually let in.
 */
export class UserService {
  private readonly cache = new Map<string, CachedIdentity>();
  // A first page load fires several tRPC calls at once. Sharing the pending
  // lookup keeps that from becoming several racing inserts for one person.
  private readonly inFlight = new Map<string, Promise<number>>();

  constructor(
    private readonly database: DatabaseState,
    private readonly now: () => number = Date.now,
  ) {}

  /** Null when no database is configured — the caller simply goes unattributed. */
  async resolve(identity: ProviderIdentity): Promise<number | null> {
    const db = this.database.db;
    if (!db) {
      return null;
    }

    const key = `${identity.provider}:${identity.subject}`;
    const cached = this.cache.get(key);
    if (
      cached &&
      cached.email === identity.email &&
      this.now() - cached.refreshedAt < REFRESH_MS
    ) {
      return cached.userId;
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return pending;
    }

    const lookup = this.upsert(db, identity)
      .then((userId) => {
        this.cache.set(key, {
          email: identity.email,
          refreshedAt: this.now(),
          userId,
        });
        return userId;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, lookup);
    return lookup;
  }

  private async upsert(db: Database, identity: ProviderIdentity) {
    const existing = await this.findUserId(db, identity);
    if (existing !== null) {
      await this.touch(db, existing, identity);
      return existing;
    }

    try {
      return await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(usersTable)
          .values({ email: identity.email })
          .returning({ id: usersTable.id });

        const [linked] = await tx
          .insert(userIdentitiesTable)
          .values({
            email: identity.email,
            provider: identity.provider,
            subject: identity.subject,
            userId: user.id,
          })
          .onConflictDoNothing()
          .returning({ userId: userIdentitiesTable.userId });

        if (!linked) {
          // Another request for the same account won the race between our
          // lookup and this insert. Roll back so the user row we just made
          // does not linger unlinked, and use theirs.
          tx.rollback();
        }

        return user.id;
      });
    } catch (error) {
      const winner = await this.findUserId(db, identity);
      if (winner === null) {
        throw error;
      }
      return winner;
    }
  }

  private async findUserId(db: Database, identity: ProviderIdentity) {
    const [row] = await db
      .select({ userId: userIdentitiesTable.userId })
      .from(userIdentitiesTable)
      .where(
        and(
          eq(userIdentitiesTable.provider, identity.provider),
          eq(userIdentitiesTable.subject, identity.subject),
        ),
      )
      .limit(1);

    return row?.userId ?? null;
  }

  private async touch(
    db: Database,
    userId: number,
    identity: ProviderIdentity,
  ) {
    await db
      .update(usersTable)
      .set({ email: identity.email, lastSeenAt: new Date() })
      .where(eq(usersTable.id, userId));

    await db
      .update(userIdentitiesTable)
      .set({ email: identity.email })
      .where(
        and(
          eq(userIdentitiesTable.provider, identity.provider),
          eq(userIdentitiesTable.subject, identity.subject),
        ),
      );
  }
}
