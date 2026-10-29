import { createHash } from "node:crypto";
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
  await client.query("SELECT pg_advisory_xact_lock(2026102909)");
  const name = "009_shopping_tools.sql";
  const sql = await readFile(
    new URL(`../../../packages/postgres/migrations/${name}`, import.meta.url),
    "utf8",
  );
  const checksum = createHash("sha256").update(sql).digest("hex");
  const prior = await client.query(
    "SELECT checksum FROM schema_migrations WHERE name=$1",
    [name],
  );
  if (prior.rowCount) {
    if (prior.rows[0].checksum !== checksum)
      throw new Error(
        "Shopping tools migration checksum differs. Existing data was preserved.",
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
      ? "Shopping tools schema is already installed."
      : "Shopping tools schema installed. Existing products, orders, payments and stock were preserved; price tracking starts now.",
  );
} catch (failure) {
  await client.query("ROLLBACK");
  throw failure;
} finally {
  client.release();
  await pool.end();
}
