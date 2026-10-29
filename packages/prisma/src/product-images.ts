import { createHash } from "node:crypto";
import type { Prisma } from "../generated/index.js";
import { db } from "./index.ts";
export function decodeProductImage(data: string) {
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(data);
  if (!match) throw new Error("Choose a JPEG, PNG or WebP product photo.");
  const bytes = Buffer.from(match[2], "base64");
  if (
    bytes.length < 4 ||
    bytes.length > 850000 ||
    bytes.toString("base64") !== match[2]
  )
    throw new Error("The photo must be smaller than 850 KB after preparation.");
  const mime = match[1];
  const valid =
    mime === "image/jpeg"
      ? bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[2] === 255 &&
        bytes.at(-2) === 255 &&
        bytes.at(-1) === 217
      : mime === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP";
  if (!valid)
    throw new Error("The selected file is not a supported product photo.");
  return {
    mime,
    bytes,
    hash: createHash("sha256").update(bytes).digest("hex"),
  };
}
export async function saveProductImage(
  tx: Prisma.TransactionClient,
  id: string,
  data?: string | null,
) {
  if (data === undefined) return;
  if (data === null) {
    await tx.$executeRaw`DELETE FROM store_product_images WHERE product_id=${id}::uuid`;
    return;
  }
  const photo = decodeProductImage(data);
  await tx.$executeRaw`INSERT INTO store_product_images(product_id,mime_type,content,content_hash) VALUES(${id}::uuid,${photo.mime},${photo.bytes},${photo.hash}) ON CONFLICT(product_id) DO UPDATE SET mime_type=excluded.mime_type,content=excluded.content,content_hash=excluded.content_hash,updated_at=now()`;
}
export async function withProductImages<
  T extends { id: string; variants?: Array<{ id: string }> },
>(items: T[]) {
  const ids = items.flatMap((item) => [
    item.id,
    ...(item.variants ?? []).map((v) => v.id),
  ]);
  if (!ids.length) return items;
  const rows = await db.$queryRaw<
    Array<{ id: string; hash: string }>
  >`SELECT product_id AS id, content_hash AS hash FROM store_product_images WHERE product_id=ANY(${ids}::uuid[])`;
  const urls = new Map(
    rows.map((row) => [
      row.id,
      "/api/product-images/" + row.id + "/" + row.hash,
    ]),
  );
  return items.map((item) => ({
    ...item,
    imageUrl: urls.get(item.id),
    ...(item.variants
      ? {
          variants: item.variants.map((v) => ({
            ...v,
            imageUrl: urls.get(v.id),
          })),
        }
      : {}),
  }));
}
export async function readProductImage(id: string, hash: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      id,
    ) ||
    !/^[0-9a-f]{64}$/.test(hash)
  )
    return null;
  const rows = await db.$queryRaw<
    Array<{ mime: string; content: Uint8Array }>
  >`SELECT mime_type AS mime,content FROM store_product_images WHERE product_id=${id}::uuid AND content_hash=${hash}`;
  return rows[0] ?? null;
}
