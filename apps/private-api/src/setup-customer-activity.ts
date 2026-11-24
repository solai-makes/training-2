import {migrationChecksum,matchesMigrationChecksum} from "../../../packages/postgres/src/migration-checksum.ts";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

if (!process.env.DATABASE_URL)
  throw new Error("Run this setup inside the training2 Dev Container.");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(2026103014)");
  const name = "014_wishlist_notifications.sql";
  const sql = await readFile(
    new URL(`../../../packages/postgres/migrations/${name}`, import.meta.url),
    "utf8",
  );
  const checksum = migrationChecksum(sql);
  const prior = await client.query(
    "SELECT checksum FROM schema_migrations WHERE name=$1",
    [name],
  );
  if (prior.rowCount) {
    if (!matchesMigrationChecksum(sql,prior.rows[0].checksum))
      throw new Error(
        "Customer activity migration checksum differs. Existing data was preserved.",
      );
  } else {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
      [name, checksum],
    );
  }
  await client.query("COMMIT");
  console.log(
    prior.rowCount
      ? "Customer activity schema is already installed."
      : "Customer activity schema installed. Existing products, orders and stock were preserved.",
  );
} catch (failure) {
  await client.query("ROLLBACK");
  throw failure;
} finally {
  client.release();
  await pool.end();
}
