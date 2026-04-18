import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

type Database = ReturnType<typeof drizzle>;

export interface DatabaseState {
  configured: boolean;
  db: Database | null;
}

export function createDatabaseState(): DatabaseState {
  const url = process.env.DATABASE_URL;

  if (!url) {
    return {
      configured: false,
      db: null,
    };
  }

  // Disable prepared statements: Supabase's pooler (port 6543) runs pgbouncer
  // in transaction mode, which doesn't support them. `postgres-js` defaults to
  // `prepare: true`, so queries fail opaquely against the pooler without this.
  const client = postgres(url, { prepare: false });

  return {
    configured: true,
    db: drizzle({ client }),
  };
}
