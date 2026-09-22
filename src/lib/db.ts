import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
const globalDb = globalThis as unknown as { pool?: Pool };
function validDatabaseUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) && !!url.hostname
    );
  } catch {
    return false;
  }
}

export const databaseUrlValid = validDatabaseUrl(process.env.DATABASE_URL);
export const pool = databaseUrlValid
  ? (globalDb.pool ??
    new Pool({
      connectionString: process.env.DATABASE_URL,
      // Serverless instances scale independently; keep each warm instance small.
      max: process.env.VERCEL ? 1 : 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    }))
  : null;
if (pool) globalDb.pool = pool;
export const db = pool ? drizzle(pool) : null;
