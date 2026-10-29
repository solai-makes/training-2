import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeProductImage } from "./product-images.ts";
test("product photos reject scripts, mislabeled images and oversized uploads", () => {
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
  const photo = decodeProductImage(png);
  assert.equal(photo.mime, "image/png");
  assert.equal(photo.hash.length, 64);
  assert.throws(() => decodeProductImage("data:image/svg+xml;base64,PHN2Zy8+"));
  assert.throws(() =>
    decodeProductImage("data:image/jpeg;base64,PHNjcmlwdD4="),
  );
  assert.throws(() =>
    decodeProductImage(
      "data:image/png;base64," + Buffer.alloc(850001).toString("base64"),
    ),
  );
});
