import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL_REQUIRED");

const pool = new Pool({ connectionString });
const migrationsDir = path.resolve("drizzle");

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dkivn_schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();

  for (const filename of files) {
    const sql = await readFile(path.join(migrationsDir, filename), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await pool.query(
      "SELECT checksum FROM dkivn_schema_migrations WHERE filename = $1",
      [filename],
    );

    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`MIGRATION_CHECKSUM_MISMATCH:${filename}`);
      }
      continue;
    }

    await pool.query(sql);
    await pool.query(
      "INSERT INTO dkivn_schema_migrations(filename, checksum) VALUES ($1, $2)",
      [filename, checksum],
    );
    console.log("applied", filename);
  }
} finally {
  await pool.end();
}
