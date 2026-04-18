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

  const client = postgres(url);

  return {
    configured: true,
    db: drizzle({ client }),
  };
}
