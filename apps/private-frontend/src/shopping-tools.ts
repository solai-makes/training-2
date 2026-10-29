import type { Ref } from "vue";
import { computed, reactive, ref, watch } from "vue";
import { h, locale } from "../../../packages/ui/src/language.ts";
import type {
  PriceReport,
  Requester,
  ReturnRecord,
} from "../../../packages/ui/src/shopping-tools.ts";
import {
  refundAmountLabel,
  returnLabel,
} from "../../../packages/ui/src/shopping-tools.ts";
import type {
  Product,
  ProductVariant,
} from "../../../packages/ui/src/storefront.ts";
import { date, money } from "../../../packages/ui/src/storefront.ts";
import "../../../packages/ui/src/shopping-tools.css";

const button = (
  text: string,
  click: () => void,
  kind = "secondary",
  disabled = false,
) =>
  h(
    "button",
    { type: "button", class: `btn ${kind}`, onClick: click, disabled },
    text,
  );
export function useStaffShopping(
  request: Requester,
  products: Ref<Product[]>,
  notify: (text: string) => void,
  refreshCatalog: () => Promise<void>,
  edit: (id: string) => void,
  remove: (id: string) => void,
  canRefund: () => boolean = () => true,
) {
  const active = ref(""),
    priceProduct = ref(""),
    days = ref(30),
    report = ref<PriceReport | null>(null),
    variantParent = ref(""),
    variants = ref<ProductVariant[]>([]),
    returns = ref<ReturnRecord[]>([]),
    error = ref(""),
    busy = ref(false),
    loading = ref(false);
  const variantForm = reactive({
    label: "",
    color: "",
    size: "",
    price: "",
    stock: "0",
  });
  const notes = reactive<Record<string, string>>({}),
    restock = reactive<Record<string, boolean>>({}),
    cashConfirmed = reactive<Record<string, boolean>>({});
  const standardProducts = computed(() =>
    products.value.filter((product) => !product.variantParentId),
  );
  const json = <T>(path: string, options?: RequestInit) =>
    request(path, options) as Promise<T>;
  const fail = (failure: unknown) => {
    error.value = failure instanceof Error ? failure.message : "Please retry.";
  };
  watch(products, () => {
    if (!priceProduct.value) priceProduct.value = products.value[0]?.id ?? "";
    if (!variantParent.value)
      variantParent.value = standardProducts.value[0]?.id ?? "";
  });
  let priceRequest = 0;
  async function loadPrice() {
    if (!priceProduct.value) return;
    const version = ++priceRequest;
    try {
      const data = await json<PriceReport>(
        `/store/products/${priceProduct.value}/price-history?days=${days.value}`,
      );
      if (version === priceRequest) report.value = data;
    } catch (failure) {
      if (version === priceRequest) fail(failure);
    }
  }
  async function loadVariants() {
    if (!variantParent.value) return;
    const id = variantParent.value;
    try {
      const data = await json<{ variants: ProductVariant[] }>(
        `/store/products/${id}/variants`,
      );
      if (id === variantParent.value) variants.value = data.variants ?? [];
    } catch (failure) {
      fail(failure);
    }
  }
  async function loadReturns() {
    try {
      returns.value = (
        await json<{ items: ReturnRecord[] }>("/store/returns")
      ).items;
    } catch (failure) {
      fail(failure);
    }
  }
  async function refresh(page: string) {
    active.value = page;
    if (loading.value) return;
    loading.value = true;
    try {
      if (page === "prices") await loadPrice();
      if (page === "variants") await loadVariants();
      if (page === "returns") await loadReturns();
    } finally {
      loading.value = false;
    }
  }
  watch([priceProduct, days], () => {
    if (active.value === "prices") {
      report.value = null;
      void loadPrice();
    }
  });
  watch(variantParent, () => {
    variants.value = [];
    if (active.value === "variants") void loadVariants();
  });
  async function addVariant(event: Event) {
    event.preventDefault();
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      await json(`/store/products/${variantParent.value}/variants`, {
        method: "POST",
        body: JSON.stringify({
          ...variantForm,
          price: Number(variantForm.price),
          stock: Number(variantForm.stock),
        }),
      });
      Object.assign(variantForm, {
        label: "",
        color: "",
        size: "",
        price: "",
        stock: "0",
      });
      await refreshCatalog();
      await loadVariants();
      notify("Option created with its own product code and stock.");
    } catch (failure) {
      fail(failure);
    } finally {
      busy.value = false;
    }
  }
  async function returnAction(
    item: ReturnRecord,
    action: "approve" | "reject" | "receive" | "refund",
  ) {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      await json(
        `/store/returns/${item.id}/${action === "refund" ? "refund" : "review"}`,
        {
          method: "POST",
          body: JSON.stringify(
            action === "refund"
              ? { cashRefundConfirmed: !!cashConfirmed[item.id] }
              : {
                  action,
                  note: notes[item.id] ?? "",
                  restock: !!restock[item.id],
                },
          ),
        },
      );
      await loadReturns();
      await refreshCatalog();
      notify(
        action === "refund"
          ? "Refund status updated."
          : "Return request updated.",
      );
    } catch (failure) {
      fail(failure);
      await loadReturns();
    } finally {
      busy.value = false;
    }
  }
  const alert = () =>
    error.value
      ? h("div", { class: "form-error", role: "alert" }, error.value)
      : null;
  function picker(
    value: string,
    change: (id: string) => void,
    items: Product[],
    label: string,
  ) {
    return h("label", { class: "field tools-product-picker" }, [
      h("span", label),
      h(
        "select",
        {
          value,
          onChange: (event: Event) =>
            change((event.target as HTMLSelectElement).value),
        },
        [
          h("option", { value: "", disabled: true }, "Choose a product"),
          ...items.map((p) =>
            h("option", { value: p.id }, `${p.name} · ${p.code}`),
          ),
        ],
      ),
    ]);
  }
  function priceChart(data: PriceReport) {
    const points = data.points;
    if (!points.length)
      return h(
        "div",
        { class: "tools-empty" },
        "Price tracking has not started for this product.",
      );
    const W = 860,
      H = 300,
      left = 88,
      right = 24,
      top = 20,
      bottom = 48;
    const first = Date.parse(points[0].at),
      last = Math.max(first + 1, Date.parse(points[points.length - 1].at)),
      max =
        Math.max(1, ...points.flatMap((p) => [p.regular, p.selling])) * 1.15;
    const x = (at: string) =>
        left + ((Date.parse(at) - first) / (last - first)) * (W - left - right),
      y = (value: number) => H - bottom - (value / max) * (H - top - bottom);
    const path = (key: "regular" | "selling") =>
      points
        .map((p, i) =>
          i
            ? `H${x(p.at).toFixed(2)}V${y(p[key]).toFixed(2)}`
            : `M${x(p.at).toFixed(2)},${y(p[key]).toFixed(2)}`,
        )
        .join(" ");
    return h(
      "svg",
      {
        viewBox: `0 0 ${W} ${H}`,
        class: "price-history-chart",
        role: "img",
        "aria-label": `${data.product.name}: regular and selling prices in Japanese yen`,
      },
      [
        ...Array.from({ length: 5 }, (_, i) => {
          const value = (max * i) / 4;
          return h("g", [
            h("line", {
              x1: left,
              x2: W - right,
              y1: y(value),
              y2: y(value),
              stroke: "#dfe8df",
              "stroke-dasharray": "3 5",
            }),
            h(
              "text",
              {
                x: left - 12,
                y: y(value) + 4,
                "text-anchor": "end",
                class: "price-axis",
              },
              money(Math.round(value)),
            ),
          ]);
        }),
        ...Array.from({ length: 4 }, (_, i) => {
          const time = first + ((last - first) * i) / 3;
          return h(
            "text",
            {
              x: left + ((W - left - right) * i) / 3,
              y: H - 15,
              "text-anchor": i === 0 ? "start" : i === 3 ? "end" : "middle",
              class: "price-axis",
            },
            new Date(time).toLocaleString(locale(), {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }),
          );
        }),
        h("path", {
          d: path("regular"),
          fill: "none",
          stroke: "#d1a64a",
          "stroke-width": 2,
          "stroke-dasharray": "6 5",
        }),
        h("path", {
          d: path("selling"),
          fill: "none",
          stroke: "#377c54",
          "stroke-width": 3,
          "stroke-linejoin": "round",
        }),
        ...points.slice(-100).map((p) =>
          h(
            "circle",
            {
              cx: x(p.at),
              cy: y(p.selling),
              r: 4,
              fill: "#377c54",
              stroke: "white",
              "stroke-width": 2,
            },
            h("title", `${date(p.at)} · ${money(p.selling)} · ${p.reason}`),
          ),
        ),
      ],
    );
  }
  function pricesPage() {
    const data = report.value;
    return [
      alert(),
      h("section", { class: "card tools-panel" }, [
        h("div", { class: "tools-toolbar" }, [
          picker(
            priceProduct.value,
            (id) => {
              priceProduct.value = id;
            },
            products.value,
            "Product price history",
          ),
          h("label", { class: "field" }, [
            h("span", "Period"),
            h(
              "select",
              {
                value: days.value,
                onChange: (event: Event) => {
                  days.value = Number(
                    (event.target as HTMLSelectElement).value,
                  );
                },
              },
              [7, 30, 90].map((value) =>
                h("option", { value }, `Last ${value} days`),
              ),
            ),
          ]),
        ]),
        data
          ? h("div", [
              h(
                "div",
                { class: "price-history-kpis" },
                [
                  ["Current selling price", money(data.product.price)],
                  [
                    "Lowest observed",
                    money(
                      Math.min(
                        ...data.points.map((p) => p.selling),
                        data.product.price,
                      ),
                    ),
                  ],
                  [
                    "Highest observed",
                    money(
                      Math.max(
                        ...data.points.map((p) => p.selling),
                        data.product.price,
                      ),
                    ),
                  ],
                ].map(([label, value]) =>
                  h("div", [h("small", label), h("strong", value)]),
                ),
              ),
              h("div", { class: "tools-panel-heading" }, [
                h("h2", "Regular price & selling price"),
                h("div", { class: "price-history-legend" }, [
                  h("span", { class: "regular" }, "Regular"),
                  h("span", { class: "selling" }, "Selling"),
                ]),
              ]),
              priceChart(data),
              h(
                "p",
                { class: "tools-note" },
                `Tracking started ${data.trackingStartedAt ? date(data.trackingStartedAt) : "today"}. The chart records actual price configurations and scheduled sale transitions. Earlier prices are unavailable.`,
              ),
              h(
                "div",
                { class: "comparison-scroll" },
                h("table", { class: "tools-table" }, [
                  h(
                    "thead",
                    h(
                      "tr",
                      ["Time", "Regular price", "Selling price", "Event"].map(
                        (label) => h("th", label),
                      ),
                    ),
                  ),
                  h(
                    "tbody",
                    data.points
                      .slice(-20)
                      .reverse()
                      .map((point) =>
                        h("tr", [
                          h("td", date(point.at)),
                          h("td", money(point.regular)),
                          h("td", money(point.selling)),
                          h("td", point.reason),
                        ]),
                      ),
                  ),
                ]),
              ),
            ])
          : h(
              "div",
              { class: "tools-empty", role: "status" },
              "Select a product to view its price history.",
            ),
      ]),
    ];
  }
  function variantsPage() {
    const parent = products.value.find((p) => p.id === variantParent.value);
    return [
      alert(),
      h("div", { class: "tools-two-column" }, [
        h("section", { class: "card tools-panel" }, [
          picker(
            variantParent.value,
            (id) => {
              variantParent.value = id;
            },
            standardProducts.value,
            "Standard product",
          ),
          h(
            "p",
            { class: "tools-note" },
            "Standard keeps its current stock. Each added option is a separate SKU with its own price and stock; checkout and returns use that exact SKU.",
          ),
          h(
            "div",
            { class: "comparison-scroll" },
            h("table", { class: "tools-table" }, [
              h(
                "thead",
                h(
                  "tr",
                  ["Option", "Price", "Stock", "Actions"].map((label) =>
                    h("th", label),
                  ),
                ),
              ),
              h("tbody", [
                parent
                  ? h("tr", [
                      h("td", [
                        h("strong", "Standard"),
                        h("small", parent.code),
                      ]),
                      h("td", money(parent.price)),
                      h("td", String(parent.stock)),
                      h(
                        "td",
                        button(
                          "Edit",
                          () => edit(parent.id),
                          "secondary small",
                          busy.value,
                        ),
                      ),
                    ])
                  : null,
                ...variants.value.map((v) =>
                  h("tr", [
                    h("td", [
                      h("strong", v.label),
                      h("small", `${v.color} ${v.size}`.trim()),
                      h("small", v.code),
                    ]),
                    h("td", money(v.price)),
                    h("td", String(v.stock)),
                    h(
                      "td",
                      h("div", { class: "tools-actions" }, [
                        button(
                          "Edit",
                          () => edit(v.id),
                          "secondary small",
                          busy.value,
                        ),
                        button(
                          "Remove",
                          () => remove(v.id),
                          "text danger",
                          busy.value,
                        ),
                      ]),
                    ),
                  ]),
                ),
              ]),
            ]),
          ),
        ]),
        h("form", { class: "card tools-panel", onSubmit: addVariant }, [
          h("h2", "Add a product option"),
          ...(
            [
              ["label", "Option label", 80],
              ["color", "Color (optional)", 40],
              ["size", "Size / capacity (optional)", 40],
            ] as const
          ).map(([key, label, max]) =>
            h("label", { class: "field" }, [
              h("span", label),
              h("input", {
                required: key === "label",
                maxlength: max,
                value: variantForm[key],
                placeholder:
                  key === "label" ? "Example: Midnight blue · Large" : "",
                onInput: (event: Event) => {
                  variantForm[key] = (event.target as HTMLInputElement).value;
                },
              }),
            ]),
          ),
          h(
            "div",
            { class: "field-grid" },
            (
              [
                ["price", "Price (JPY)"],
                ["stock", "Initial stock"],
              ] as const
            ).map(([key, label]) =>
              h("label", { class: "field" }, [
                h("span", label),
                h("input", {
                  type: "number",
                  min: 0,
                  max: key === "price" ? 9999999 : 1000000,
                  step: 1,
                  required: true,
                  value: variantForm[key],
                  onInput: (event: Event) => {
                    variantForm[key] = (event.target as HTMLInputElement).value;
                  },
                }),
              ]),
            ),
          ),
          h(
            "button",
            {
              type: "submit",
              class: "btn primary full",
              disabled: busy.value || !variantParent.value,
            },
            busy.value ? "Creating…" : "Create option",
          ),
        ]),
      ]),
    ];
  }
  function returnsPage() {
    return [
      alert(),
      h(
        "p",
        { class: "tools-note" },
        "Review whole-order returns, record receipt and inspection, then process the refund. Restock only saleable goods. Payment and inventory actions are recorded once.",
      ),
      !returns.value.length
        ? h(
            "section",
            { class: "card tools-empty" },
            "No customer return requests yet.",
          )
        : h(
            "div",
            { class: "staff-return-grid" },
            returns.value.map((item) =>
              h("article", { class: "card tools-panel", key: item.id }, [
                h("div", { class: "tools-panel-heading" }, [
                  h("h2", `#${item.orderId.slice(0, 8).toUpperCase()}`),
                  h("span", { class: "tools-pill" }, returnLabel(item.status)),
                ]),
                h("p", [
                  h("strong", item.receipt.recipient?.name ?? "Customer"),
                  " · ",
                  money(item.receipt.total),
                ]),
                h("p", item.reason),
                item.details ? h("p", { class: "muted" }, item.details) : null,
                h(
                  "small",
                  `Requested ${date(item.createdAt)} · ${item.provider ?? "Historical"} / ${item.paymentState ?? "unknown"}`,
                ),
                h(
                  "ul",
                  { class: "return-items" },
                  item.receipt.items.map((line) =>
                    h("li", `${line.name} × ${line.quantity}`),
                  ),
                ),
                ["requested", "approved"].includes(item.status)
                  ? h("label", { class: "field" }, [
                      h("span", "Message to customer / inspection notes"),
                      h("textarea", {
                        rows: 2,
                        maxlength: 1000,
                        value: notes[item.id] ?? item.staffNote,
                        onInput: (event: Event) => {
                          notes[item.id] = (
                            event.target as HTMLTextAreaElement
                          ).value;
                        },
                      }),
                    ])
                  : item.staffNote
                    ? h("p", { class: "tools-note" }, item.staffNote)
                    : null,
                item.status === "requested"
                  ? h("div", { class: "tools-actions" }, [
                      button(
                        "Approve return",
                        () => void returnAction(item, "approve"),
                        "primary",
                        busy.value,
                      ),
                      button(
                        "Decline",
                        () => void returnAction(item, "reject"),
                        "secondary",
                        busy.value,
                      ),
                    ])
                  : null,
                item.status === "approved"
                  ? h("div", [
                      h("label", { class: "check-label" }, [
                        h("input", {
                          type: "checkbox",
                          checked: !!restock[item.id],
                          onChange: (event: Event) => {
                            restock[item.id] = (
                              event.target as HTMLInputElement
                            ).checked;
                          },
                        }),
                        "Inspected and saleable — add items back to stock",
                      ]),
                      button(
                        "Record items received",
                        () => void returnAction(item, "receive"),
                        "primary",
                        busy.value,
                      ),
                    ])
                  : null,
                ["received", "refunding"].includes(item.status) && canRefund()
                  ? h("div", [
                      item.provider === "cod"
                        ? h("label", { class: "check-label" }, [
                            h("input", {
                              type: "checkbox",
                              checked: !!cashConfirmed[item.id],
                              onChange: (event: Event) => {
                                cashConfirmed[item.id] = (
                                  event.target as HTMLInputElement
                                ).checked;
                              },
                            }),
                            `I have already returned ${refundAmountLabel(item)} in cash to the customer.`,
                          ])
                        : null,
                      h(
                        "p",
                        { class: "fine-print" },
                        item.provider === "cod"
                          ? "This records cash already paid back. It does not transfer money."
                          : item.provider?.startsWith("demo_")
                            ? "Demo refund only. No money moves."
                            : "This sends a refund request to the configured test/sandbox provider.",
                      ),
                      button(
                        item.provider === "cod"
                          ? "Record cash refund"
                          : item.status === "refunding"
                            ? "Check / retry refund"
                            : "Process provider refund",
                        () => void returnAction(item, "refund"),
                        "primary",
                        busy.value ||
                          (item.provider === "cod" && !cashConfirmed[item.id]),
                      ),
                    ])
                  : null,
                item.status === "refunded"
                  ? h(
                      "strong",
                      { class: "green" },
                      `Refund recorded: ${refundAmountLabel(item)}`,
                    )
                  : null,
                item.inventoryProcessed
                  ? h(
                      "p",
                      { class: "tools-note" },
                      item.stockRestocked
                        ? "Returned units were added back to stock."
                        : "Returned units were not added to saleable stock.",
                    )
                  : null,
              ]),
            ),
          ),
    ];
  }
  return { refresh, pricesPage, variantsPage, returnsPage };
}
