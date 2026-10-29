import { readSubcategory } from "./product-subcategories.ts";
export const PRODUCT_CATEGORIES = [
  "Tech & audio",
  "Home & living",
  "Everyday carry",
  "Wellness",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
type PricedProduct = { name: string; description: string; price: number };
export function discountedPrice(basePrice: number, percentage: number): number {
  return Math.round((basePrice * (100 - percentage)) / 100);
}
export function cleanProductDescription(description: string): string {
  const prefix = description.match(/^\[([^\]]+)\]\s*/);
  const body =
    prefix && PRODUCT_CATEGORIES.includes(prefix[1] as ProductCategory)
      ? description.slice(prefix[0].length)
      : description;
  return body
    .replace(/\s*\[(?:Launch|Offer) \d+% off; reference JPY \d+\]/g, "")
    .replace(/\s*\[Subcategory: [^\]]+\]/g, "")
    .replace(/\s*\[Sale window \S+ \S+\]/g, "")
    .trim();
}
export function productDetails(product: PricedProduct): {
  category: ProductCategory;
  basePrice: number;
  discountPercent: number;
} {
  const prefix = product.description.match(/^\[([^\]]+)\]/)?.[1];
  const text = `${product.name} ${product.description}`;
  const category = PRODUCT_CATEGORIES.includes(prefix as ProductCategory)
    ? (prefix as ProductCategory)
    : /headphone|earbud|speaker|keyboard|mouse|charger|wireless|tech|camera|audio/i.test(
          text,
        )
      ? "Tech & audio"
      : /bag|backpack|tote|wallet|carry|travel/i.test(text)
        ? "Everyday carry"
        : /yoga|fitness|bottle|wellness|sport/i.test(text)
          ? "Wellness"
          : "Home & living";
  const offer = product.description.match(
    /\[(?:Launch|Offer) (\d+)% off; reference JPY (\d+)\]/,
  );
  const percentage = Number(offer?.[1] ?? 0),
    base = Number(offer?.[2] ?? product.price);
  if (
    offer &&
    percentage > 0 &&
    percentage <= 100 &&
    Number.isSafeInteger(base) &&
    base >= 0 &&
    base <= 9999999 &&
    (discountedPrice(base, percentage) === product.price ||
      (product.description.includes("[Sale window ") && base === product.price))
  )
    return { category, basePrice: base, discountPercent: percentage };
  return { category, basePrice: product.price, discountPercent: 0 };
}
/** Preserve the existing schema's category/offer description tags; price is always the payable unit price. */
export function prepareProduct(
  input: PricedProduct & {
    category?: ProductCategory;
    discountPercent?: number;
    offerStartsAt?: string | null;
    offerEndsAt?: string | null;
  },
): { description: string; price: number } {
  // Older clients continue to submit an already-payable price without offer controls.
  if (input.category === undefined && input.discountPercent === undefined)
    return { description: input.description, price: input.price };
  const prior = productDetails(input),
    category = input.category ?? prior.category;
  const percentage = input.discountPercent ?? prior.discountPercent;
  const base =
    input.discountPercent === undefined ? prior.basePrice : input.price;
  if (
    !Number.isInteger(percentage) ||
    percentage < 0 ||
    percentage > 100 ||
    !Number.isInteger(base) ||
    base < 0 ||
    base > 9999999
  )
    throw new Error("Invalid regular price or discount percentage.");
  const window = input.description.match(/\[Sale window (\S+) (\S+)\]/);
  const start =
    input.offerStartsAt === undefined ? window?.[1] : input.offerStartsAt;
  const end = input.offerEndsAt === undefined ? window?.[2] : input.offerEndsAt;
  if (
    (start || end) &&
    (!start ||
      !end ||
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) ||
      Date.parse(end) <= Date.parse(start) ||
      percentage === 0)
  )
    throw new Error(
      "Set a positive discount and an end time after the start time.",
    );
  const description = [
    `[${category}]`,
    cleanProductDescription(input.description),
    readSubcategory(input.description)
      ? `[Subcategory: ${readSubcategory(input.description)}]`
      : "",
    percentage > 0 ? `[Offer ${percentage}% off; reference JPY ${base}]` : "",
    start && end
      ? `[Sale window ${new Date(start).toISOString()} ${new Date(end).toISOString()}]`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    description,
    price: start && end ? base : discountedPrice(base, percentage),
  };
}
