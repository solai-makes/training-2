export const COUPON_MINIMUM_JPY = 20_000;
const coupons: Readonly<Record<string, number>> = {
  solai26: 10,
  santhoshhere341: 8,
};

export function couponQuote(subtotal: number, code?: string) {
  const normalized = code?.trim().toLowerCase() ?? "";
  if (!normalized) return { code: "", percent: 0, discount: 0, error: "" };
  const percent = coupons[normalized];
  if (!percent)
    return {
      code: normalized,
      percent: 0,
      discount: 0,
      error: "This coupon code is not valid.",
    };
  if (subtotal <= COUPON_MINIMUM_JPY)
    return {
      code: normalized,
      percent,
      discount: 0,
      error:
        "Coupons apply only to a product subtotal above ¥20,000, after product offers and before tax.",
    };
  return {
    code: normalized,
    percent,
    discount: Math.round((subtotal * percent) / 100),
    error: "",
  };
}
