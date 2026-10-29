export const SUBCATEGORIES: Record<string, string[]> = {
  "Tech & audio": [
    "Bluetooth & audio",
    "Mobiles",
    "Chargers & cables",
    "Cases & sleeves",
    "Power banks",
    "Keyboards & mice",
    "Cameras & accessories",
    "Screens & stands",
    "Other electronics",
  ],
  "Home & living": [
    "Kitchen & dining",
    "Lighting",
    "Bedding & textiles",
    "Decor & fragrance",
    "Storage & organization",
    "Stationery",
    "Food & drinks",
    "Other home",
  ],
  "Everyday carry": [
    "Backpacks",
    "Totes & handbags",
    "Travel bags",
    "Wallets & pouches",
    "Travel accessories",
    "Laptop sleeves",
    "Other carry",
  ],
  Wellness: [
    "Yoga & stretching",
    "Fitness equipment",
    "Recovery & relaxation",
    "Bottles & hydration",
    "Towels & accessories",
    "Journals & mindfulness",
    "Other wellness",
  ],
};
/** Derive a browsing group without changing the staff-assigned main category or product data. */
export function productSubcategory(
  product: { name: string; description?: string },
  parent: string,
): string {
  const explicit = readSubcategory(product.description ?? "");
  if (explicit) return explicit;
  const text = product.name.normalize("NFKC").toLowerCase(),
    compact = text.replace(/\s+/g, "");
  if (/power\s*bank|battery\s*pack/.test(text)) return "Power banks";
  if (
    /(?:phone|mobile|tablet).*(?:case|cover)|(?:case|cover).*(?:phone|mobile|tablet)/.test(
      text,
    )
  )
    return "Cases & sleeves";
  if (
    /^(?:iphone|samsung|sanmsung|smartphone|mobilephone)(?:\d|$)/.test(compact)
  )
    return "Mobiles";
  const groups: Record<string, Array<[RegExp, string]>> = {
    "Tech & audio": [
      [/charger|charging|adapter|cable|usb.*hub/, "Chargers & cables"],
      [/case|sleeve/, "Cases & sleeves"],
      [
        /headphone|earbud|speaker|bluetooth|microphone|audio/,
        "Bluetooth & audio",
      ],
      [/keyboard|mouse/, "Keyboards & mice"],
      [/camera|tripod|lens|light panel/, "Cameras & accessories"],
      [/monitor|screen|stand|cooling/, "Screens & stands"],
    ],
    "Home & living": [
      [/organizer|storage|basket|drawer|rack/, "Storage & organization"],
      [/lamp|lighting|light/, "Lighting"],
      [
        /cushion|pillow|duvet|towel|rug|blanket|throw|linen|textile/,
        "Bedding & textiles",
      ],
      [/vase|frame|candle|clock|plant|decor|scent/, "Decor & fragrance"],
      [
        /plate|mug|bowl|cutlery|kitchen|glass|jar|infuser|serving|coffee set/,
        "Kitchen & dining",
      ],
      [/paper|notebook|pen\b|stationery/, "Stationery"],
      [/coffee|tea\b|food|drink/, "Food & drinks"],
    ],
    "Everyday carry": [
      [/backpack|rucksack/, "Backpacks"],
      [/sleeve/, "Laptop sleeves"],
      [/wallet|pouch|passport/, "Wallets & pouches"],
      [/tote|crossbody|handbag|lunch/, "Totes & handbags"],
      [/bag/, "Travel bags"],
      [/umbrella|packing|cube|luggage|strap|travel/, "Travel accessories"],
    ],
    Wellness: [
      [/bottle|shaker|hydration/, "Bottles & hydration"],
      [/journal|notebook/, "Journals & mindfulness"],
      [/towel/, "Towels & accessories"],
      [
        /roller|massage|recovery|eye pillow|meditation/,
        "Recovery & relaxation",
      ],
      [/yoga|mat|stretch/, "Yoga & stretching"],
      [
        /fitness|resistance|band|grip|jump|rope|pilates|exercise|training/,
        "Fitness equipment",
      ],
    ],
  };
  return (
    groups[parent]?.find(([pattern]) => pattern.test(text))?.[1] ??
    SUBCATEGORIES[parent]?.at(-1) ??
    "Other home"
  );
}

export function readSubcategory(description: string): string | null {
  const label = description.match(/\[Subcategory: ([^\]]+)\]/)?.[1];
  return label &&
    Object.values(SUBCATEGORIES).some((values) => values.includes(label))
    ? label
    : null;
}
export function setSubcategory(description: string, label: string): string {
  const text = description.replace(/\s*\[Subcategory: [^\]]+\]/g, "").trim();
  if (!label) return text;
  if (!Object.values(SUBCATEGORIES).some((values) => values.includes(label)))
    throw new Error("Choose a valid subcategory.");
  return [text, `[Subcategory: ${label}]`].filter(Boolean).join(" ");
}
