import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
if (!process.env.DATABASE_URL)
  throw new Error("Run this command inside the training2 Dev Container.");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const client = await pool.connect();
const examples = [
  [
    "Studio Wireless Headphones",
    "Immersive sound, soft ear cushions, and an everyday wireless design.",
    8900,
    24,
  ],
  [
    "Everyday Canvas Backpack",
    "A comfortable carry for work, weekends, and everything in between.",
    6400,
    18,
  ],
  [
    "Quiet Hours Desk Lamp",
    "Warm light and a simple silhouette for a calmer workspace.",
    4900,
    12,
  ],
  [
    "Daily Ceramic Mug",
    "Your morning ritual, with a comfortable handle and warm terracotta finish.",
    1800,
    36,
  ],
  [
    "Flow Insulated Bottle",
    "Keep your everyday hydration close with a durable insulated bottle.",
    3200,
    22,
  ],
  [
    "Compact Wireless Keyboard",
    "A clean, compact keyboard that gives your desk some breathing room.",
    7200,
    9,
  ],
  [
    "Pocket Wireless Earbuds",
    "Lightweight audio for your commute, walks, and in-between moments.",
    5900,
    4,
  ],
  [
    "Soft Form Yoga Mat",
    "A supportive, easy-to-roll mat for movement and a little stillness.",
    4100,
    16,
  ],
  [
    "Weekend Bluetooth Speaker",
    "Room-filling wireless sound in a warm, compact design.",
    6800,
    7,
  ],
  [
    "Everyday Notebook",
    "A sturdy journal for ideas, lists, and the things worth remembering.",
    1400,
    40,
  ],
  [
    "Comfort Wireless Mouse",
    "Smooth, simple navigation with a comfortable everyday shape.",
    2900,
    5,
  ],
  [
    "Essential Storage Set",
    "Keep your home organized with a thoughtfully sized storage set.",
    3500,
    0,
  ],
] as const;
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(20261023)");
  const name = "006_storefront_receipts.sql";
  const sql = await readFile(
    new URL("../../../packages/postgres/migrations/" + name, import.meta.url),
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
        "The installed storefront migration differs from this file.",
      );
  } else {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
      [name, checksum],
    );
  }
  const count = await client.query("SELECT count(*) AS total FROM products");
  if (Number(count.rows[0].total) === 0) {
    for (const [name, description, price, stock] of examples) {
      const sequence = await client.query(
        "SELECT nextval('product_code_seq') AS number",
      );
      const number = sequence.rows[0].number;
      await client.query(
        "INSERT INTO products(code,name,description,price,stock,product_number) VALUES($1,$2,$3,$4,$5,$6)",
        [
          `A-${String(number).padStart(2, "0")}`,
          name,
          description,
          price,
          stock,
          number,
        ],
      );
    }
    console.log("Added 12 example products to the empty catalog.");
  } else console.log("Existing catalog preserved. No sample products added.");
  await client.query("COMMIT");
  console.log(
    "Storefront upgrade complete. Existing orders and products were preserved.",
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
