import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
if (!process.env.DATABASE_URL)
  throw new Error("Run this command inside the training2 Dev Container.");
const catalog: Record<string, Array<[string, number, number]>> = {
  "Tech & audio": [
    ["Focus Noise-Cancelling Headphones", 12900, 30],
    ["Mini Wireless Speaker", 3600, 40],
    ["Travel USB-C Charger", 2200, 45],
    ["Mechanical Desk Keyboard", 9200, 18],
    ["Pocket Digital Camera", 18500, 12],
    ["Slim Wireless Mouse", 2800, 35],
    ["Studio Podcast Microphone", 7400, 16],
    ["Portable Power Bank Charger", 3400, 28],
    ["Smartphone Camera Tripod", 2600, 24],
    ["Premium Audio Cable Set", 1500, 55],
    ["Dual Wireless Charging Stand", 4500, 20],
    ["Sport Wireless Earbuds", 6200, 26],
  ],
  "Home & living": [
    ["Stoneware Breakfast Bowl", 1600, 42],
    ["Linen Cushion Cover", 2300, 32],
    ["Warm Oak Bedside Lamp", 5400, 18],
    ["Glass Kitchen Storage Jars", 2900, 28],
    ["Cotton Bath Towel Set", 3800, 36],
    ["Amber Scented Candle", 2100, 40],
    ["Bamboo Desk Organizer", 2700, 25],
    ["Soft Knit Throw Blanket", 4800, 22],
    ["Ceramic Plant Pot", 1900, 38],
    ["Minimal Wall Clock", 3200, 20],
    ["Wooden Serving Tray", 2400, 24],
    ["Pour-Over Coffee Set", 4200, 30],
  ],
  "Everyday carry": [
    ["City Rolltop Backpack", 6900, 24],
    ["Lightweight Weekend Travel Bag", 8200, 18],
    ["Everyday Cotton Tote Bag", 1900, 45],
    ["Compact Leather Wallet", 4600, 26],
    ["Waterproof Laptop Carry Sleeve", 3400, 28],
    ["Travel Packing Cube Set", 2800, 30],
    ["Crossbody Sling Bag", 3900, 22],
    ["Canvas Carry Pouch", 1400, 48],
    ["Leather Travel Passport Wallet", 3700, 20],
    ["Foldable Grocery Tote Bag", 1700, 36],
    ["Commuter Messenger Bag", 7600, 16],
    ["Trail Daypack Backpack", 5800, 25],
  ],
  Wellness: [
    ["Cork Yoga Block Set", 2200, 34],
    ["Stainless Sport Water Bottle", 2800, 36],
    ["Resistance Fitness Band Set", 1900, 44],
    ["Textured Yoga Roller", 3200, 25],
    ["Fitness Recovery Massage Ball", 1300, 50],
    ["Quick-Dry Sport Towel", 1600, 38],
    ["Grip Yoga Sock Set", 1400, 42],
    ["Adjustable Fitness Jump Rope", 2100, 32],
    ["Mindful Wellness Journal", 1800, 40],
    ["Soft Yoga Knee Cushion", 2300, 28],
    ["Leakproof Sport Shaker Bottle", 2400, 35],
    ["Home Fitness Stretch Strap", 1700, 45],
  ],
};
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const client = await pool.connect();
let added = 0;
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(20261023)");
  const name = "007_catalog_payments.sql",
    sql = await readFile(
      new URL("../../../packages/postgres/migrations/" + name, import.meta.url),
      "utf8",
    ),
    checksum = createHash("sha256").update(sql).digest("hex");
  const prior = await client.query(
    "SELECT checksum FROM schema_migrations WHERE name=$1",
    [name],
  );
  if (prior.rowCount) {
    if (prior.rows[0].checksum !== checksum)
      throw new Error(
        "The installed payment migration differs from this file.",
      );
  } else {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
      [name, checksum],
    );
  }
  for (const [category, items] of Object.entries(catalog))
    for (const [i, [name, price, stock]] of items.entries()) {
      const key = `catalog-v2:${category}:${i}`;
      if (
        (
          await client.query(
            "SELECT 1 FROM store_catalog_seeds WHERE seed_key=$1",
            [key],
          )
        ).rowCount
      )
        continue;
      const existing = await client.query(
        "SELECT id FROM products WHERE name=$1 LIMIT 1",
        [name],
      );
      let id = existing.rows[0]?.id;
      if (!id) {
        const n = (
          await client.query("SELECT nextval('product_code_seq') AS n")
        ).rows[0].n;
        id = (
          await client.query(
            "INSERT INTO products(code,name,description,price,stock,product_number) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
            [
              `A-${String(n).padStart(2, "0")}`,
              name,
              `[${category}] A thoughtfully selected essential with practical details and an everyday design.`,
              price,
              stock,
              n,
            ],
          )
        ).rows[0].id;
        added++;
        await client.query(
          "INSERT INTO store_inventory_events(product_id,product_code,product_name,delta,stock_after,reason,actor_id) SELECT id,code,name,stock,stock,'Catalog expansion','local-setup' FROM products WHERE id=$1",
          [id],
        );
      }
      await client.query(
        "INSERT INTO store_catalog_seeds(seed_key,product_id) VALUES($1,$2)",
        [key, id],
      );
    }
  await client.query("COMMIT");
  console.log(
    `Added ${added} products across four categories. Existing products, prices and orders were preserved.`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
