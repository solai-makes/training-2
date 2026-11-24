import { db } from "../../../packages/prisma/src/index.ts";
import { StoreError } from "../../../packages/prisma/src/store.ts";
import {
  Product,
  ProductInput,
  ProductUpdateInput,
} from "../../../packages/api-contracts/src/index.ts";
import {
  prepareProduct,
  productDetails,
} from "../../../packages/api-contracts/src/product-details.ts";
import { pricedProduct } from "../../../packages/api-contracts/src/scheduled-price.ts";
import {
  decodeProductImage,
  saveProductImage,
  withProductImages,
} from "../../../packages/prisma/src/product-images.ts";
import type { z } from "zod";
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new StoreError(
      400,
      "INVALID_INPUT",
      parsed.error.issues[0]?.message ?? "Check the supplied fields.",
    );
  return parsed.data;
};
export function productDto(product: {
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    ...productDetails(product),
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    price: pricedProduct(product).price,
    stock: product.stock,
    createdAt: product.created_at.toISOString(),
    updatedAt: product.updated_at.toISOString(),
  };
}
export async function saveStaffProduct(
  id: string | null,
  value: unknown,
  actor: string,
) {
  const input = id
    ? parse(ProductUpdateInput, value)
    : parse(ProductInput, value);
  if (input.imageData) {
    try {
      decodeProductImage(input.imageData);
    } catch (error) {
      throw new StoreError(400, "INVALID_IMAGE", (error as Error).message);
    }
  }
  const product = await db.$transaction(async (tx) => {
    if (id) {
      const rows = await tx.$queryRaw<
        Array<{ updated_at: Date; stock: number }>
      >`SELECT updated_at,stock FROM products WHERE id=${id}::uuid FOR UPDATE`;
      if (!rows[0])
        throw new StoreError(404, "NOT_FOUND", "Product not found.");
      const expected =
        "expectedUpdatedAt" in input ? input.expectedUpdatedAt : undefined;
      if (
        expected &&
        rows[0].updated_at.getTime() !== Date.parse(String(expected))
      )
        throw new StoreError(
          409,
          "CONFLICT",
          "This product changed while you were editing. Close this dialog, refresh, and try again.",
        );
      const saved = await tx.products.update({
        where: { id },
        data: {
          name: input.name,
          ...prepareProduct(input),
          stock: input.stock,
          updated_at: new Date(),
        },
      });
      const delta = input.stock - rows[0].stock;
      if (delta)
        await tx.$executeRaw`INSERT INTO store_inventory_events(product_id,product_code,product_name,delta,stock_after,reason,actor_id) VALUES(${id}::uuid,${saved.code},${saved.name},${delta},${saved.stock},'Product edit',${actor})`;
      await saveProductImage(tx, id, input.imageData);
      return saved;
    }
    const [sequence] = await tx.$queryRaw<
      Array<{ next_number: bigint }>
    >`SELECT nextval('product_code_seq') AS next_number`;
    if (!sequence) throw Error("PRODUCT_CODE_SEQUENCE_UNAVAILABLE");
    const created = await tx.products.create({
      data: {
        code: "A-" + sequence.next_number.toString().padStart(2, "0"),
        name: input.name,
        ...prepareProduct(input),
        stock: input.stock,
        product_number: sequence.next_number,
      },
    });
    if (created.stock > 0)
      await tx.$executeRaw`INSERT INTO store_inventory_events(product_id,product_code,product_name,delta,stock_after,reason,actor_id) VALUES(${created.id}::uuid,${created.code},${created.name},${created.stock},${created.stock},'Initial product stock',${actor})`;
    await saveProductImage(tx, created.id, input.imageData);
    return created;
  });
  return Product.parse((await withProductImages([productDto(product)]))[0]);
}
export async function deleteStaffProduct(id: string) {
  if (!(await db.products.findUnique({ where: { id } })))
    throw new StoreError(404, "NOT_FOUND", "Product not found.");
  try {
    await db.products.delete({ where: { id } });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2003"
    )
      throw new StoreError(
        409,
        "CONFLICT",
        "This product is used by an order or has variants. Remove unused variants first.",
      );
    throw error;
  }
  return { ok: true };
}
