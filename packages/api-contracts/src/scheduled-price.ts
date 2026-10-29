import { discountedPrice, productDetails } from "./product-details.ts";

export function saleWindow(product: { description: string }) {
  const match = product.description.match(/\[Sale window (\S+) (\S+)\]/);
  return match ? { startsAt: match[1], endsAt: match[2] } : null;
}
export function activeProductDetails(
  product: { name: string; description: string; price: number },
  now = Date.now(),
) {
  const details = productDetails(product),
    window = saleWindow(product);
  const active =
    !window ||
    (now >= Date.parse(window.startsAt) && now < Date.parse(window.endsAt));
  return { ...details, discountPercent: active ? details.discountPercent : 0 };
}
export function pricedProduct<
  T extends { name: string; description: string; price: number },
>(product: T, now = Date.now()) {
  const details = activeProductDetails(product, now);
  return {
    ...product,
    ...details,
    price: discountedPrice(details.basePrice, details.discountPercent),
  };
}
