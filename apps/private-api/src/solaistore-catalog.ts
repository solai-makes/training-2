import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
if (!process.env.DATABASE_URL)
  throw new Error("Run inside the training2 Dev Container.");
const groups: Record<string, string[]> = {
  "Tech & audio": [
    "Over-Ear Studio Headphones",
    "Pocket Bluetooth Speaker",
    "USB-C Charging Hub",
    "Wireless Desk Keyboard",
    "Ergonomic Silent Mouse",
    "Smartphone Camera Lens",
    "Laptop Cooling Stand",
    "Noise-Isolating Earbuds",
    "Portable Screen Monitor",
    "Braided Audio Cable",
    "Desktop Microphone",
    "Wireless Charging Pad",
    "Camera Light Panel",
    "Tablet Drawing Stylus",
    "Travel Power Adapter",
  ],
  "Home & living": [
    "Ceramic Dinner Plate Set",
    "Linen Table Runner",
    "Bamboo Drawer Organizer",
    "Glass Tea Infuser",
    "Oak Reading Lamp",
    "Cotton Cushion Set",
    "Stoneware Coffee Mug",
    "Recycled Glass Vase",
    "Kitchen Spice Rack",
    "Soft Woven Rug",
    "Wooden Picture Frame",
    "Scented Candle Collection",
    "Bedside Storage Basket",
    "Cotton Duvet Cover",
    "Stainless Cutlery Set",
  ],
  "Everyday carry": [
    "City Commuter Backpack",
    "Canvas Weekend Bag",
    "Leather Card Wallet",
    "Foldable Shopping Tote",
    "Travel Toiletry Pouch",
    "Waterproof Laptop Sleeve",
    "Crossbody Organizer Bag",
    "Compact Travel Umbrella",
    "Packing Cube Collection",
    "Passport Document Wallet",
    "Lightweight Gym Bag",
    "Rolltop Cycling Backpack",
    "Reusable Lunch Carry Bag",
    "Key Organizer Pouch",
    "Travel Luggage Strap",
  ],
  Wellness: [
    "Cork Yoga Mat",
    "Insulated Water Bottle",
    "Fitness Resistance Band",
    "Foam Recovery Roller",
    "Massage Therapy Ball",
    "Quick-Dry Exercise Towel",
    "Adjustable Jump Rope",
    "Guided Wellness Journal",
    "Yoga Balance Cushion",
    "Stretching Strap Set",
    "Grip Training Rings",
    "Meditation Floor Cushion",
    "Sport Shaker Bottle",
    "Pilates Exercise Ring",
    "Cooling Eye Pillow",
  ],
};
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(20261028)");
  const name = "008_solaistore_demo.sql",
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
      throw new Error("Migration checksum differs.");
  } else {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
      [name, checksum],
    );
  }
  const batchKey = "solaistore-fivefold-v1";
  const batch = await client.query(
    "SELECT * FROM store_catalog_batches WHERE batch_key=$1",
    [batchKey],
  );
  if (batch.rowCount) {
    console.log(
      "Solaistore catalog already expanded. Products will not be duplicated or restored after deletion.",
    );
  } else {
    const baseline = Number(
        (await client.query("SELECT count(*) AS n FROM products")).rows[0].n,
      ),
      additions = baseline * 4;
    await client.query(
      "INSERT INTO store_catalog_batches(batch_key,baseline,target) VALUES($1,$2,$3)",
      [batchKey, baseline, baseline * 5],
    );
    const entries = Object.entries(groups),
      styles = ["Essential", "Signature", "Studio", "Premium"];
    let added = 0;
    for (let i = 0; i < additions; i++) {
      const [group, names] = entries[i % 4],
        position = Math.floor(i / 4),
        name =
          styles[Math.floor(position / 15) % 4] +
          " " +
          names[position % 15] +
          (position >= 60
            ? " · Edition " + (Math.floor(position / 60) + 1)
            : "");
      const reference =
          1800 + (position % 15) * 600 + Math.floor(position / 15) * 800,
        offer = position % 5 === 0,
        price = offer ? reference / 2 : reference,
        stock = 18 + ((i * 7) % 65);
      const n = (await client.query("SELECT nextval('product_code_seq') AS n"))
        .rows[0].n;
      const result = await client.query(
        "INSERT INTO products(code,name,description,price,stock,product_number) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [
          `A-${String(n).padStart(2, "0")}`,
          name,
          `[${group}] A practical everyday essential from the Solaistore collection.${offer ? ` [Launch 50% off; reference JPY ${reference}]` : ""}`,
          price,
          stock,
          n,
        ],
      );
      const id = result.rows[0].id;
      await client.query(
        "INSERT INTO store_catalog_seeds(seed_key,product_id) VALUES($1,$2)",
        [batchKey + ":" + i, id],
      );
      await client.query(
        "INSERT INTO store_inventory_events(product_id,product_code,product_name,delta,stock_after,reason,actor_id) SELECT id,code,name,stock,stock,'Solaistore catalog expansion','local-setup' FROM products WHERE id=$1",
        [id],
      );
      added++;
    }
    await client.query(
      "UPDATE store_catalog_batches SET added=$1 WHERE batch_key=$2",
      [added, batchKey],
    );
    console.log(
      `Solaistore: added ${added} products. Catalog expanded from ${baseline} to ${baseline + added}. Existing products and orders preserved.`,
    );
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
