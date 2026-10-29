import { locale } from "./language.ts";
import type { Tracking } from "./order-tracking.ts";
export type ProductVariant = {
  imageUrl?: string;
  id: string;
  code: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  label: string;
  color: string;
  size: string;
  basePrice?: number;
  discountPercent?: number;
};
export type Product = {
  variantParentId?: string;
  variants?: ProductVariant[];
  imageUrl?: string;
  id: string;
  code: string;
  name: string;
  description: string;
  category?: string;
  basePrice?: number;
  discountPercent?: number;
  price: number;
  stock: number;
  createdAt: string;
  updatedAt: string;
};
export type CartItem = { productId: string; quantity: number };
export type ReceiptItem = {
  productId: string;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};
export type Recipient = {
  name: string;
  address: string;
  city: string;
  postalCode: string;
};
export type Receipt = {
  storeName?: string;
  loyalty?: {pointsRedeemed:number;discount:number;earnEvery:number};
  orderId: string;
  status: string;
  currency: string;
  items: ReceiptItem[];
  subtotal: number;
  tracking?: Tracking;
  discount?: number;
  coupon?: { code: string; percent: number };
  tax: number;
  shipping: number;
  total: number;
  recipient: Recipient | null;
  confirmedAt: string | null;
  payment?: {
    provider: string;
    state: string;
    currency: string;
    amountMinor: number;
    fxRate: number;
    fxDate: string;
    paymentId?: string;
  };
};
export type Order = {
  imageUrl?: string;
  id: string;
  status: "pending" | "confirmed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  items: ReceiptItem[];
  receipt: Omit<Receipt, "orderId" | "status"> | null;
  gateway?: {
    provider: string;
    keyId?: string;
    providerOrderId: string;
    url: string | null;
    currency: string;
    amountMinor: number;
    mode: string;
  } | null;
};
export const money = (n: number, currency = "JPY") =>
  new Intl.NumberFormat(locale(), {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "INR" ? 2 : 0,
  }).format(n);
export const date = (s: string) =>
  new Date(s).toLocaleString(locale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export const categories = [
  "All products",
  "Tech & audio",
  "Home & living",
  "Everyday carry",
  "Wellness",
];
export function category(product: Pick<Product, "name" | "description">) {
  const explicit = product.description.match(/^\[([^\]]+)\]/)?.[1];
  if (explicit && categories.includes(explicit)) return explicit;
  const text = `${product.name} ${product.description}`;
  if (
    /headphone|earbud|speaker|keyboard|mouse|charger|wireless|tech|camera|audio/i.test(
      text,
    )
  )
    return "Tech & audio";
  if (/bag|backpack|tote|wallet|carry|travel/i.test(text))
    return "Everyday carry";
  if (/yoga|fitness|bottle|wellness|sport/i.test(text)) return "Wellness";
  return "Home & living";
}
const paths: Record<string, string> = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  cart: '<path d="M2 3h3l3 12h11l3-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  box: '<path d="m3 7 9-5 9 5v10l-9 5-9-5Zm0 0 9 5 9-5M12 12v10M7.5 4.5l9 5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  refresh:
    '<path d="M20 7v-5m0 5h-5M4 17v5m0-5h5M20 7A9 9 0 0 0 4 6M4 17a9 9 0 0 0 16 1"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  chart: '<path d="M4 3v18h18M8 16l4-5 4 2 5-8"/>',
  truck:
    '<path d="M2 5h12v12H2Zm12 5h5l3 4v3h-8"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/>',
  shield: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6ZM8 12l3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="m15 4 5 5M4 20l1-6L16 3l5 5-11 11Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  logout: '<path d="M9 3H3v18h6m0-9h13m-5-5 5 5-5 5"/>',
};
export function iconSvg(name: string) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.box}</svg>`;
}
export function artSvg(
  product: Pick<Product, "name" | "description"> & { imageUrl?: string },
  large = false,
) {
  if (product.imageUrl && /^\/api\/product-images\/[0-9a-f-]{36}\/[0-9a-f]{64}$/.test(product.imageUrl)) {
    const alt = product.name.replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
    return '<svg class="product-photo" viewBox="0 0 280 240" role="img" aria-label="'+alt+'"><rect width="280" height="240" fill="white"/><image href="'+product.imageUrl+'" width="280" height="240" preserveAspectRatio="xMidYMid meet"/></svg>';
  }
  const text = product.name.normalize("NFKC").toLowerCase();
  let art = "";
  if (/^(?:iphone|samsung|sanmsung|smartphone|mobilephone)(?:\d|$)/.test(text.replace(/\s+/g, "")))
    art = '<rect x="91" y="24" width="108" height="190" rx="23" fill="#253a34"/><rect x="97" y="30" width="96" height="178" rx="18" fill="#b5c8be"/><path d="M101 165C124 113 150 144 190 69v125a10 10 0 0 1-10 10h-68a11 11 0 0 1-11-11Z" fill="#6d9688"/><path d="M101 131c34-27 42-79 89-77v64c-37 2-45 52-89 61Z" fill="#e4c79a" opacity=".82"/><rect x="124" y="36" width="43" height="11" rx="6" fill="#253a34"/><circle cx="156" cy="41.5" r="2" fill="#6a8378"/><rect x="128" y="196" width="34" height="3" rx="2" fill="#eef4ef"/><path d="M89 65v24m0 9v17m112-30v32" stroke="#64786d" stroke-width="3" stroke-linecap="round"/>';
  else if (/headphone|audio/.test(text))
    art =
      '<path d="M78 133v-27a62 62 0 0 1 124 0v27" fill="none" stroke="#283634" stroke-width="20"/><path d="M78 121v-19a62 62 0 0 1 124 0v19" fill="none" stroke="#6d7e78" stroke-width="5"/><rect x="59" y="114" width="43" height="76" rx="20" fill="#24322e"/><rect x="178" y="114" width="43" height="76" rx="20" fill="#24322e"/><rect x="79" y="122" width="15" height="59" rx="7" fill="#64756c"/><rect x="185" y="122" width="15" height="59" rx="7" fill="#64756c"/>';
  else if (/earbud/.test(text))
    art =
      '<rect x="68" y="122" width="144" height="84" rx="36" fill="#e8e4dc" stroke="#c6c0b5" stroke-width="2"/><path d="M71 144h138" stroke="#c6c0b5"/><circle cx="140" cy="166" r="3" fill="#628d75"/><rect x="94" y="52" width="22" height="65" rx="11" fill="#f8f7f4"/><ellipse cx="103" cy="60" rx="21" ry="17" fill="#ded9cf"/><rect x="165" y="52" width="22" height="65" rx="11" fill="#f8f7f4"/><ellipse cx="177" cy="60" rx="21" ry="17" fill="#ded9cf"/>';
  else if (/bag|backpack|tote/.test(text))
    art =
      '<path d="M112 76V60a28 28 0 0 1 56 0v16" fill="none" stroke="#665746" stroke-width="9"/><rect x="70" y="72" width="140" height="139" rx="32" fill="#bda68a"/><path d="M78 96h124" stroke="#8c785e" stroke-width="3"/><rect x="92" y="133" width="96" height="60" rx="14" fill="#ab9478"/><rect x="126" y="104" width="28" height="12" rx="3" fill="#eadfce"/>';
  else if (/bottle/.test(text))
    art =
      '<rect x="117" y="30" width="46" height="26" rx="8" fill="#233e36"/><path d="M116 54h48l12 24v123a18 18 0 0 1-18 18h-36a18 18 0 0 1-18-18V78Z" fill="#7b9d85"/><path d="M117 85v104" stroke="#b6cbb8" stroke-width="6" stroke-linecap="round"/><path d="M109 111h62" stroke="#698b73"/>';
  else if (/lamp/.test(text))
    art =
      '<ellipse cx="140" cy="208" rx="53" ry="12" fill="#b69d74"/><path d="M140 200V85" stroke="#a48b65" stroke-width="8"/><path d="m98 40-22 78h128l-22-78Z" fill="#e9ca8c"/><ellipse cx="140" cy="118" rx="64" ry="10" fill="#c7a569"/>';
  else if (/keyboard/.test(text))
    art =
      '<g transform="translate(35 78) rotate(-9 100 50)"><rect width="210" height="105" rx="15" fill="#d4d7d2" stroke="#acb3aa" stroke-width="3"/><path d="M15 22h180M15 42h180M15 62h180M65 84h85" stroke="#f8f9f6" stroke-width="12" stroke-linecap="round"/><path d="M35 14v55m25-55v55m25-55v55m25-55v55m25-55v55m25-55v55m25-55v55" stroke="#c3c9c0" stroke-width="4"/></g>';
  else if (/speaker/.test(text))
    art =
      '<rect x="81" y="51" width="118" height="159" rx="31" fill="#c8956b"/><rect x="91" y="62" width="98" height="139" rx="23" fill="#aa7955"/><circle cx="140" cy="148" r="35" fill="#815e45"/><circle cx="140" cy="95" r="16" fill="#6e5340"/><circle cx="140" cy="148" r="22" fill="#966e51"/>';
  else if (/mug|cup/.test(text))
    art =
      '<path d="M182 96h19a27 27 0 0 1 0 54h-19" fill="none" stroke="#b66e48" stroke-width="15"/><path d="M77 87h112v92a30 30 0 0 1-30 30h-52a30 30 0 0 1-30-30Z" fill="#d29068"/><ellipse cx="133" cy="87" rx="56" ry="11" fill="#e1ac88"/><ellipse cx="133" cy="88" rx="43" ry="6" fill="#764c34"/><path d="M104 58c-15-14 10-19 0-34m33 34c-15-14 10-19 0-34" fill="none" stroke="#d1c3b4" stroke-width="3"/>';
  else if (/yoga|mat/.test(text))
    art =
      '<path d="M45 156 196 78l42 40-151 84Z" fill="#a8ad9c"/><ellipse cx="66" cy="179" rx="32" ry="25" fill="#7f8d79" transform="rotate(20 66 179)"/><ellipse cx="66" cy="179" rx="22" ry="16" fill="none" stroke="#c3c9b8" stroke-width="4"/><ellipse cx="66" cy="179" rx="10" ry="6" fill="none" stroke="#c3c9b8" stroke-width="3"/>';
  else if (/notebook|journal/.test(text))
    art =
      '<g transform="rotate(-12 140 125)"><rect x="79" y="37" width="128" height="177" rx="9" fill="#48766c"/><path d="M91 38v175" stroke="#2c5a51" stroke-width="5"/><path d="M193 38v175" stroke="#aec6ae" stroke-width="5"/><rect x="113" y="81" width="61" height="31" rx="3" fill="#d2c5a2"/></g>';
  else if (/mouse/.test(text))
    art =
      '<ellipse cx="140" cy="127" rx="49" ry="77" fill="#caccc6"/><path d="M140 51v68m-47-10h94" stroke="#adb2a9" stroke-width="2"/><rect x="135" y="77" width="10" height="23" rx="5" fill="#697b6a"/>';
  else
    art =
      '<rect x="76" y="65" width="128" height="138" rx="20" fill="#c3bba7"/><path d="m76 92 64 28 64-28m-64 28v83M76 65l64-28 64 28-64 28Z" fill="#e4ddcc" stroke="#b6aa90" stroke-width="2"/><path d="m114 49 65 29v26l-28 12V90l-65-29" fill="#a9946d"/>';
  return `<svg viewBox="0 0 280 250" role="img" aria-label="Product illustration"${large ? ' class="large-art"' : ""}><ellipse cx="140" cy="221" rx="86" ry="12" fill="#25372e" opacity=".07"/>${art}</svg>`;
}
export function adminToken(token: string) {
  try {
    const raw = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (
      JSON.parse(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, "=")))[
        "cognito:groups"
      ]?.includes("admin") === true
    );
  } catch {
    return false;
  }
}
export function readCart(key: string): CartItem[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter(
          (i) =>
            typeof i.productId === "string" &&
            Number.isInteger(i.quantity) &&
            i.quantity > 0 &&
            i.quantity <= 1000,
        )
      : [];
  } catch {
    return [];
  }
}
