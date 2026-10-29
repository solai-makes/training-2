import type { Ref } from "vue";
import { computed, reactive, ref, watch } from "vue";
import {
  cleanProductDescription,
  productDetails,
} from "../../../packages/api-contracts/src/product-details.ts";
import { h } from "../../../packages/ui/src/language.ts";
import type {
  Requester,
  ReturnableOrder,
  ReturnRecord,
  SavedAddress,
} from "../../../packages/ui/src/shopping-tools.ts";
import {
  refundAmountLabel,
  returnLabel,
} from "../../../packages/ui/src/shopping-tools.ts";
import type {
  Product,
  Recipient,
} from "../../../packages/ui/src/storefront.ts";
import {
  artSvg,
  category,
  date,
  money,
} from "../../../packages/ui/src/storefront.ts";
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
export function useShoppingTools(
  request: Requester,
  catalog: Ref<Product[]>,
  identity: () => string,
  notify: (message: string) => void,
  pickProduct: (product: Product) => void,
  navigate: (page: "addresses" | "returns" | "compare") => void,
) {
  const addressList = ref<SavedAddress[]>([]),
    returnList = ref<ReturnRecord[]>([]),
    returnable = ref<ReturnableOrder[]>([]),
    error = ref(""),
    busy = ref(false),
    loading = ref(false),
    editing = ref("");
  const address = reactive({
    label: "Home",
    name: "",
    address: "",
    city: "",
    postalCode: "",
    isDefault: false,
  });
  const returnForm = reactive({
    orderId: "",
    reason: "Damaged or defective",
    details: "",
  });
  const selectedAddress = ref("");
  let initial: string[] = [];
  try {
    const value = JSON.parse(
      localStorage.getItem("solaistore.compare") ?? "[]",
    );
    if (Array.isArray(value))
      initial = value
        .filter((id): id is string => typeof id === "string")
        .slice(0, 4);
  } catch {}
  const comparisonIds = ref([...new Set(initial)]);
  const comparePickerOpen = ref(false);
  const compareSearch = ref("");
  const compareCategory = ref("");
  const compareLimit = ref(12);
  watch([compareSearch, compareCategory], () => { compareLimit.value = 12; });
  const comparison = computed(() =>
    comparisonIds.value
      .map((id) => catalog.value.find((product) => product.id === id))
      .filter((p): p is Product => !!p),
  );
  watch(
    comparisonIds,
    (ids) => localStorage.setItem("solaistore.compare", JSON.stringify(ids)),
    { deep: true },
  );
  watch(identity, () => {
    addressList.value = [];
    returnList.value = [];
    returnable.value = [];
    editing.value = "";
    selectedAddress.value = "";
    resetAddress();
    error.value = "";
  });
  const json = <T>(path: string, options?: RequestInit) =>
    request(path, options) as Promise<T>;
  const fail = (failure: unknown) => {
    error.value = failure instanceof Error ? failure.message : "Please retry.";
  };
  async function loadAddresses() {
    if (!identity()) return;
    const owner = identity();
    try {
      const data = await json<{ items: SavedAddress[] }>("/account/addresses");
      if (identity() === owner) addressList.value = data.items;
    } catch (failure) {
      if (identity() === owner) fail(failure);
    }
  }
  async function loadReturns() {
    if (!identity() || loading.value) return;
    const owner = identity();
    loading.value = true;
    try {
      const [requests, orders] = await Promise.all([
        json<{ items: ReturnRecord[] }>("/account/returns"),
        json<{ items: ReturnableOrder[] }>("/account/returnable-orders"),
      ]);
      if (identity() === owner) {
        returnList.value = requests.items;
        returnable.value = orders.items;
      }
    } catch (failure) {
      if (identity() === owner) fail(failure);
    } finally {
      loading.value = false;
    }
  }
  function resetAddress() {
    Object.assign(address, {
      label: "Home",
      name: "",
      address: "",
      city: "",
      postalCode: "",
      isDefault: false,
    });
    editing.value = "";
  }
  async function saveAddress(event: Event) {
    event.preventDefault();
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      await json(
        `/account/addresses${editing.value ? `/${editing.value}` : ""}`,
        {
          method: editing.value ? "PUT" : "POST",
          body: JSON.stringify({
            label: address.label,
            recipient: {
              name: address.name,
              address: address.address,
              city: address.city,
              postalCode: address.postalCode,
            },
            isDefault: address.isDefault,
          }),
        },
      );
      resetAddress();
      await loadAddresses();
      notify("Delivery address saved.");
    } catch (failure) {
      fail(failure);
    } finally {
      busy.value = false;
    }
  }
  async function removeAddress(item: SavedAddress) {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      await request(`/account/addresses/${item.id}`, { method: "DELETE" });
      if (editing.value === item.id) resetAddress();
      if (selectedAddress.value === item.id) selectedAddress.value = "";
      await loadAddresses();
      notify("Saved address removed.");
    } catch (failure) {
      fail(failure);
    } finally {
      busy.value = false;
    }
  }
  async function submitReturn(event: Event) {
    event.preventDefault();
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      await json("/account/returns", {
        method: "POST",
        body: JSON.stringify({ ...returnForm }),
      });
      returnForm.orderId = "";
      returnForm.details = "";
      await loadReturns();
      notify("Return request sent to store staff.");
    } catch (failure) {
      fail(failure);
    } finally {
      busy.value = false;
    }
  }
  function toggleCompare(product: Product) {
    const index = comparisonIds.value.indexOf(product.id);
    if (index >= 0)
      comparisonIds.value = comparisonIds.value.filter(
        (id) => id !== product.id,
      );
    else if (comparisonIds.value.length < 4) {
      comparisonIds.value = [...comparisonIds.value, product.id];
      notify("Added to comparison.");
    } else notify("Compare up to four products. Remove one to add another.");
  }
  function compareButton(product: Product) {
    const selected = comparisonIds.value.includes(product.id);
    return h(
      "button",
      {
        type: "button",
        class: `compare-toggle ${selected ? "selected" : ""}`,
        "aria-pressed": selected,
        onClick: () => toggleCompare(product),
      },
      selected ? "✓ Comparing" : "＋ Compare",
    );
  }
  const alert = () =>
    error.value
      ? h("div", { class: "form-error", role: "alert" }, error.value)
      : null;
  function addressPicker(delivery: Recipient) {
    return h("div", { class: "saved-address-picker" }, [
      h("label", { class: "field" }, [
        h("span", "Use a saved address"),
        h(
          "select",
          {
            value: selectedAddress.value,
            onChange: (event: Event) => {
              selectedAddress.value = (event.target as HTMLSelectElement).value;
              const item = addressList.value.find(
                (a) => a.id === selectedAddress.value,
              );
              if (item) Object.assign(delivery, item.recipient);
            },
          },
          [
            h("option", { value: "" }, "Enter address below"),
            ...addressList.value.map((item) =>
              h(
                "option",
                { value: item.id },
                `${item.label}${item.isDefault ? " · Default" : ""} · ${item.recipient.city}`,
              ),
            ),
          ],
        ),
      ]),
      button("Manage saved addresses", () => navigate("addresses"), "text"),
    ]);
  }
  async function prepareCheckout(delivery: Recipient) {
    await loadAddresses();
    const preferred = addressList.value.find((item) => item.isDefault);
    if (preferred && Object.values(delivery).every((value) => !value)) {
      Object.assign(delivery, preferred.recipient);
      selectedAddress.value = preferred.id;
    }
  }
  function addressesPage(signIn: () => void) {
    if (!identity())
      return [
        h("section", { class: "card tools-empty" }, [
          h("h1", "Saved addresses"),
          h("p", "Sign in to manage your private delivery addresses."),
          button("Sign in", signIn, "primary"),
        ]),
      ];
    return [
      h("div", { class: "page-heading" }, [
        h("span", { class: "eyebrow" }, "YOUR ACCOUNT"),
        h("h1", "Your saved addresses"),
        h(
          "p",
          { class: "muted" },
          "Save up to ten delivery addresses and choose a default for checkout.",
        ),
      ]),
      alert(),
      h("div", { class: "tools-two-column" }, [
        h(
          "section",
          { class: "tools-address-list" },
          addressList.value.length
            ? addressList.value.map((item) =>
                h("article", { class: "card tools-panel", key: item.id }, [
                  h("div", { class: "tools-panel-heading" }, [
                    h("h2", item.label),
                    item.isDefault
                      ? h("span", { class: "tools-pill" }, "Default")
                      : null,
                  ]),
                  h("address", [
                    h("strong", item.recipient.name),
                    h("span", item.recipient.address),
                    h(
                      "span",
                      `${item.recipient.city} · ${item.recipient.postalCode}`,
                    ),
                  ]),
                  h("div", { class: "tools-actions" }, [
                    button(
                      "Edit",
                      () => {
                        editing.value = item.id;
                        Object.assign(address, {
                          label: item.label,
                          ...item.recipient,
                          isDefault: item.isDefault,
                        });
                      },
                      "secondary",
                      busy.value,
                    ),
                    button(
                      "Remove",
                      () => void removeAddress(item),
                      "text danger",
                      busy.value,
                    ),
                  ]),
                ]),
              )
            : [
                h(
                  "div",
                  { class: "card tools-empty" },
                  "No addresses saved yet. Add your first address here.",
                ),
              ],
        ),
        h("form", { class: "card tools-panel", onSubmit: saveAddress }, [
          h("h2", editing.value ? "Edit address" : "Add a delivery address"),
          ...(
            [
              ["label", "Address label", 40],
              ["name", "Full name", 100],
              ["address", "Street address", 200],
              ["city", "City / region", 100],
              ["postalCode", "Postal code", 30],
            ] as const
          ).map(([key, label, max]) =>
            h("label", { class: "field" }, [
              h("span", label),
              h("input", {
                required: true,
                maxlength: max,
                value: address[key],
                onInput: (event: Event) => {
                  address[key] = (event.target as HTMLInputElement).value;
                },
              }),
            ]),
          ),
          h("label", { class: "check-label" }, [
            h("input", {
              type: "checkbox",
              checked: address.isDefault,
              onChange: (event: Event) => {
                address.isDefault = (event.target as HTMLInputElement).checked;
              },
            }),
            "Use as my default address",
          ]),
          h("div", { class: "tools-actions" }, [
            h(
              "button",
              { type: "submit", class: "btn primary", disabled: busy.value },
              busy.value ? "Saving…" : "Save address",
            ),
            editing.value
              ? button("Cancel edit", resetAddress, "secondary", busy.value)
              : null,
          ]),
        ]),
      ]),
    ];
  }
  function returnsPage(signIn: () => void) {
    if (!identity())
      return [
        h("section", { class: "card tools-empty" }, [
          h("h1", "Returns & refunds"),
          button("Sign in", signIn, "primary"),
        ]),
      ];
    const eligible = returnable.value.filter(
      (order) => !returnList.value.some((item) => item.orderId === order.id),
    );
    return [
      h("div", { class: "page-heading" }, [
        h("span", { class: "eyebrow" }, "AFTER YOUR DELIVERY"),
        h("h1", "Returns & refunds"),
        h(
          "p",
          { class: "muted" },
          "Request a whole-order return within 30 days of delivery. Staff review the request before you send items back.",
        ),
      ]),
      alert(),
      h("div", { class: "tools-two-column" }, [
        h("section", [
          h("h2", "Your requests"),
          ...returnList.value.map((item) =>
            h(
              "article",
              { class: "card tools-panel return-request", key: item.id },
              [
                h("div", { class: "tools-panel-heading" }, [
                  h("h3", `Order #${item.orderId.slice(0, 8).toUpperCase()}`),
                  h(
                    "span",
                    { class: `tools-pill return-${item.status}` },
                    returnLabel(item.status),
                  ),
                ]),
                h("p", item.reason),
                item.details ? h("p", { class: "muted" }, item.details) : null,
                h("small", `Requested ${date(item.createdAt)}`),
                item.staffNote
                  ? h("p", { class: "tools-note" }, `Staff: ${item.staffNote}`)
                  : null,
                item.status === "approved"
                  ? h(
                      "p",
                      { class: "tools-note" },
                      "Contact store staff for return instructions. Send the complete order after approval.",
                    )
                  : null,
                item.status === "refunded"
                  ? h(
                      "strong",
                      { class: "green" },
                      `Refund recorded: ${refundAmountLabel(item)}`,
                    )
                  : null,
                item.status === "completed"
                  ? h(
                      "p",
                      "No refund was due because payment had not been collected.",
                    )
                  : null,
                item.status === "refunding"
                  ? h(
                      "p",
                      "Your provider refund is processing. This page refreshes automatically.",
                    )
                  : null,
              ],
            ),
          ),
          !returnList.value.length
            ? h(
                "div",
                { class: "card tools-empty" },
                loading.value ? "Loading requests…" : "No return requests yet.",
              )
            : null,
        ]),
        h("form", { class: "card tools-panel", onSubmit: submitReturn }, [
          h("h2", "Request a return"),
          h("label", { class: "field" }, [
            h("span", "Delivered order"),
            h(
              "select",
              {
                required: true,
                value: returnForm.orderId,
                onChange: (event: Event) => {
                  returnForm.orderId = (
                    event.target as HTMLSelectElement
                  ).value;
                },
              },
              [
                h("option", { value: "" }, "Choose an eligible order"),
                ...eligible.map((order) =>
                  h(
                    "option",
                    { value: order.id },
                    `#${order.id.slice(0, 8).toUpperCase()} · ${money(order.receipt.total)}`,
                  ),
                ),
              ],
            ),
          ]),
          !eligible.length
            ? h(
                "p",
                { class: "tools-note" },
                "No eligible delivered orders. Requests become available after delivery; orders already requested are listed on the left.",
              )
            : null,
          h("label", { class: "field" }, [
            h("span", "Reason"),
            h(
              "select",
              {
                value: returnForm.reason,
                onChange: (event: Event) => {
                  returnForm.reason = (event.target as HTMLSelectElement).value;
                },
              },
              [
                "Damaged or defective",
                "Wrong item",
                "Not as described",
                "Changed my mind",
                "Other",
              ].map((value) => h("option", { value }, value)),
            ),
          ]),
          h("label", { class: "field" }, [
            h("span", "Additional details"),
            h("textarea", {
              maxlength: 1000,
              rows: 4,
              value: returnForm.details,
              onInput: (event: Event) => {
                returnForm.details = (
                  event.target as HTMLTextAreaElement
                ).value;
              },
            }),
          ]),
          h(
            "p",
            { class: "fine-print" },
            "Refunds follow staff receipt and inspection. Cash refunds are recorded only after staff have paid them. Demo payments never charge or refund real money.",
          ),
          h(
            "button",
            {
              type: "submit",
              class: "btn primary full",
              disabled: busy.value || !eligible.length,
            },
            busy.value ? "Sending…" : "Submit return request",
          ),
        ]),
      ]),
    ];
  }
  function comparisonPage() {
    const products = comparison.value;
    const full = comparisonIds.value.length >= 4;
    const query = compareSearch.value.trim().toLocaleLowerCase();
    const available = catalog.value.filter(p => !p.variantParentId && !comparisonIds.value.includes(p.id));
    const categories = [...new Set(available.map(category))].sort();
    const matches = available.filter(p => (!compareCategory.value || category(p) === compareCategory.value) && (!query || [p.name, p.code, category(p)].join(" ").toLocaleLowerCase().includes(query)));
    function openPicker() {
      comparePickerOpen.value = true;
      compareSearch.value = "";
      compareCategory.value = "";
      compareLimit.value = 12;
    }
    const rows: Array<[string, (p: Product) => string]> = [
      ["Current standard price", (p) => money(p.price)],
      ["Regular standard price", (p) => money(productDetails(p).basePrice)],
      ["Category", category],
      ["Standard option stock", (p) => `${p.stock} available`],
      [
        "Available options",
        (p) =>
          ["Standard", ...(p.variants ?? []).map((v) => v.label)].join(", "),
      ],
      ["Product code", (p) => p.code],
      [
        "Description",
        (p) =>
          cleanProductDescription(p.description) ||
          "No additional description.",
      ],
    ];
    return [
      h("div", { class: "page-heading" }, [
        h("span", { class: "eyebrow" }, "SIDE BY SIDE"),
        h("h1", "Compare your favorites"),
        h(
          "p",
          { class: "muted" },
          "Choose up to four products. Prices and stock below refer to the standard option; choose an option before adding variant products.",
        ),
      ]),
      h("div", { class: "comparison-toolbar" }, [
        h("strong", { role: "status", "aria-live": "polite" }, `${products.length} of 4 products selected`),
        h("div", { class: "comparison-controls" }, [
          button("Add another product", openPicker, "primary", full),
          button("Clear comparison", () => { comparisonIds.value = []; notify("Comparison cleared."); }, "secondary", !comparisonIds.value.length),
        ]),
        full ? h("p", { class: "muted" }, "Comparison is full. Remove a product to add another.") : null,
      ]),
      comparePickerOpen.value ? h("section", { class: "card comparison-picker", "aria-label": "Add products to comparison" }, [
        h("div", { class: "comparison-picker-heading" }, [h("h2", "Find a product to compare"), button("Close product picker", () => { comparePickerOpen.value = false; }, "secondary")]),
        h("div", { class: "comparison-picker-filters" }, [
          h("label", ["Search products", h("input", { type: "search", placeholder: "Search by name or product code", value: compareSearch.value, onInput: (e: Event) => { compareSearch.value = (e.target as HTMLInputElement).value; } })]),
          h("label", ["Category", h("select", { value: compareCategory.value, onChange: (e: Event) => { compareCategory.value = (e.target as HTMLSelectElement).value; } }, [h("option", { value: "" }, "All categories"), ...categories.map(c => h("option", { value: c }, c))])]),
        ]),
        full ? h("p", { role: "status" }, "Four products selected. Remove one below to make room.") : h("p", { class: "muted", role: "status" }, `${matches.length} products available to compare`),
        !matches.length ? h("p", "No matching products. Try another search or category.") : h("div", { class: "comparison-picker-grid" }, matches.slice(0, compareLimit.value).map(product => h("article", { key: product.id, class: "comparison-choice" }, [
          h("div", { class: "comparison-choice-art", innerHTML: artSvg(product) }),
          h("div", [h("h3", product.name), h("p", { class: "muted" }, category(product)), h("strong", money(product.price))]),
          h("button", { type: "button", class: "btn secondary", disabled: full, "aria-label": `Add ${product.name} to comparison`, onClick: () => { toggleCompare(product); } }, "Add to comparison"),
        ]))),
        matches.length > compareLimit.value ? button("Show more products", () => { compareLimit.value += 12; }) : null,
      ]) : null,
      !products.length
        ? h(
            "div",
            { class: "card tools-empty" },
            [h("h2", "Start your comparison"), h("p", "Add products here to compare prices, stock and options side by side."), button("Choose products", openPicker, "primary")],
          )
        : h("section", { class: "card comparison-scroll" }, [
            h("table", { class: "comparison-table" }, [
              h(
                "thead",
                h("tr", [
                  h("th", "Product"),
                  ...products.map((product) =>
                    h("th", { key: product.id }, [
                      h("div", {
                        class: "comparison-art",
                        innerHTML: artSvg(product),
                      }),
                      h("h2", product.name),
                      h("button", { type: "button", class: "btn comparison-remove", "aria-label": `Remove ${product.name} from comparison`, onClick: () => { toggleCompare(product); notify("Removed from comparison."); } }, "× Remove product"),
                    ]),
                  ),
                ]),
              ),
              h("tbody", [
                ...rows.map(([label, value]) =>
                  h("tr", [
                    h("th", { scope: "row" }, label),
                    ...products.map((product) => h("td", value(product))),
                  ]),
                ),
                h("tr", [
                  h("th", "Choose"),
                  ...products.map((product) =>
                    h(
                      "td",
                      button(
                        product.variants?.length
                          ? "Choose options"
                          : "Add to cart",
                        () => pickProduct(product),
                        "primary",
                        !product.stock &&
                          !product.variants?.some((v) => v.stock > 0),
                      ),
                    ),
                  ),
                ]),
              ]),
            ]),
          ]),
    ];
  }
  return {
    addressList,
    returnList,
    comparisonIds,
    compareButton,
    loadAddresses,
    loadReturns,
    prepareCheckout,
    addressPicker,
    addressesPage,
    returnsPage,
    comparisonPage,
  };
}
