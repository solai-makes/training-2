import { computed, onBeforeUnmount, reactive, ref, watch, type Ref } from "vue";
import {
  DEFAULT_SETTINGS,
  loyaltyDiscount,
  type Settings,
} from "../../../packages/api-contracts/src/store-growth.ts";
import { h } from "../../../packages/ui/src/language.ts";
import {
  date,
  money,
  type CartItem,
  type Product,
} from "../../../packages/ui/src/storefront.ts";
import type { Requester } from "../../../packages/ui/src/shopping-tools.ts";
import "../../../packages/ui/src/store-growth.css";
type Ticket = {
  id: string;
  subject: string;
  status: string;
  orderId: string | null;
  updatedAt: string;
  messages: Array<{ sender: string; message: string; createdAt: string }>;
};
type Loyalty = {
  available: number;
  balance: number;
  earned: number;
  tier: string;
  rules: Settings;
  history: Array<{
    id: string;
    orderId: string;
    delta: number;
    reason: string;
    createdAt: string;
  }>;
};
type Saved = { items: CartItem[]; version: number; updatedAt: string | null };
const button = (text: string, click: () => void, disabled = false) =>
  h(
    "button",
    { type: "button", class: "btn secondary", onClick: click, disabled },
    text,
  );
export function useCustomerGrowth(
  request: Requester,
  token: Ref<string>,
  cart: Ref<CartItem[]>,
  catalog: Ref<Product[]>,
  notify: (text: string) => void,
  openLogin: () => void,
) {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS }),
    eligible = ref(false),
    error = ref(""),
    cartError = ref(""),
    busy = ref(false),
    requestedPoints = ref(0),
    loyalty = ref<Loyalty | null>(null),
    offeredCart = ref<Saved | null>(null),
    cartReady = ref(false),
    cartVersion = ref(0);
  const support = ref<Ticket[]>([]),
    selectedTicket = ref(""),
    reply = ref(""),
    ticket = reactive({ subject: "", message: "", orderId: "" });
  let timer: ReturnType<typeof setTimeout> | undefined,
    saving = false,
    dirty = false,
    applying = false,
    sessionGeneration = 0,
    loyaltyLoading = false;
  const json = <T>(path: string, options?: RequestInit) =>
    request(path, options) as Promise<T>;
  let settingsLoadedAt=0;
  async function loadSettings() {
    if(Date.now()-settingsLoadedAt<30000)return;
    try {
      const response = await fetch("/api/store/settings", {
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) { settings.value = (await response.json()).settings;settingsLoadedAt=Date.now(); }
    } catch {
      /* Keep the last known public store details. */
    }
  }
  async function loadLoyalty() {
    if (!eligible.value || loyaltyLoading) return;
    const identity = token.value;
    loyaltyLoading = true;
    try {
      const result = await json<Loyalty>("/account/growth/loyalty");
      if (identity === token.value) loyalty.value = result;
    } catch (failure) {
      if (identity === token.value) error.value = (failure as Error).message;
    } finally {
      loyaltyLoading = false;
    }
  }
  async function loadCart() {
    if (!eligible.value) return;
    const identity = token.value;
    try {
      const saved = await json<Saved>("/account/growth/cart");
      if (identity !== token.value) return;
      cartVersion.value = saved.version;
      cartReady.value = true;
      offeredCart.value =
        saved.items.length &&
        JSON.stringify(saved.items) !== JSON.stringify(cart.value)
          ? saved
          : null;
      cartError.value = "";
      if (!cart.value.length && catalog.value.length && offeredCart.value)
        restore(false);
      else if (!offeredCart.value && cart.value.length) scheduleSave();
    } catch (failure) {
      if (identity === token.value)
        cartError.value = (failure as Error).message;
    }
  }
  async function sessionChanged() {
    const generation = ++sessionGeneration;
    clearTimeout(timer);
    eligible.value = false;
    cartReady.value = false;
    cartVersion.value = 0;
    offeredCart.value = null;
    loyalty.value = null;
    requestedPoints.value = 0;
    support.value = [];
    selectedTicket.value = "";
    reply.value = "";
    Object.assign(ticket, { subject: "", message: "", orderId: "" });
    error.value = "";
    cartError.value = "";
    if (!token.value) return;
    try {
      const profile = await json<{ eligible: boolean }>(
        "/account/growth/profile",
      );
      if (generation !== sessionGeneration) return;
      eligible.value = profile.eligible;
      if (profile.eligible) await Promise.all([loadCart(), loadLoyalty()]);
    } catch (failure) {
      if (generation === sessionGeneration)
        error.value = (failure as Error).message;
    }
  }
  watch(token, () => void sessionChanged(), { immediate: true });
  watch(catalog, () => {
    if (eligible.value && offeredCart.value && !cart.value.length)
      restore(false);
  });
  function restore(merge: boolean) {
    const saved = offeredCart.value;
    if (!saved || !catalog.value.length) return;
    const next = merge ? cart.value.map((i) => ({ ...i })) : [];
    let adjusted = false;
    for (const item of saved.items) {
      const product = catalog.value.find((p) => p.id === item.productId);
      if (!product || product.stock === 0) {
        adjusted = true;
        continue;
      }
      const found = next.find((i) => i.productId === item.productId);
      const desired = item.quantity + (found?.quantity ?? 0);
      const quantity = Math.min(1000, product.stock, desired);
      if (quantity !== desired) adjusted = true;
      if (found) found.quantity = quantity;
      else next.push({ productId: item.productId, quantity });
    }
    if (next.length > 50) {
      cartError.value = "Keep at most 50 different products in a saved cart.";
      return;
    }
    applying = true;
    cart.value = next;
    sessionStorage.setItem("training2.cart", JSON.stringify(next));
    applying = false;
    offeredCart.value = null;
    scheduleSave();
    notify(
      adjusted
        ? "Cart restored with current stock limits. Review quantities and prices."
        : "Your saved cart is back. Current prices apply.",
    );
  }
  async function saveNow() {
    if (!eligible.value || !cartReady.value || offeredCart.value) return;
    if (saving) {
      dirty = true;
      return;
    }
    saving = true;
    dirty = false;
    const identity = token.value,
      items = cart.value.map((i) => ({ ...i })),
      version = cartVersion.value;
    try {
      const saved = await json<Saved>("/account/growth/cart", {
        method: "PUT",
        body: JSON.stringify({ items, version }),
      });
      if (identity === token.value) {
        cartVersion.value = saved.version;
        cartError.value = "";
      }
    } catch (failure) {
      if (identity === token.value) {
        if (items.length === 0) {
          const latest = await json<Saved>("/account/growth/cart").catch(
            () => null,
          );
          if (latest && !latest.items.length) {
            cartVersion.value = latest.version;
            cartError.value = "";
          } else cartError.value = (failure as Error).message;
        } else cartError.value = (failure as Error).message;
      }
    } finally {
      saving = false;
      if (dirty && identity === token.value && !cartError.value) void saveNow();
    }
  }
  function scheduleSave() {
    if (!eligible.value || !cartReady.value || applying || offeredCart.value)
      return;
    clearTimeout(timer);
    timer = setTimeout(() => void saveNow(), 650);
  }
  watch(cart, scheduleSave, { deep: true, flush: "sync" });
  onBeforeUnmount(() => clearTimeout(timer));
  function pointsToUse(net: number) {
    const rules = loyalty.value?.rules ?? settings.value;
    const maximum = loyaltyDiscount(
      0,
      loyalty.value?.available ?? 0,
      Math.max(0, net),
      rules,
    ).maxPoints;
    return eligible.value
      ? Math.min(
          Math.max(0, Math.floor(requestedPoints.value) || 0),
          maximum,
          loyalty.value?.available ?? 0,
          100000000,
        )
      : 0;
  }
  function discount(net: number) {
    return (
      pointsToUse(net) *
      (loyalty.value?.rules.loyaltyYenPerPoint ??
        settings.value.loyaltyYenPerPoint)
    );
  }
  async function loadSupport() {
    if (!token.value) return;
    const identity = token.value;
    try {
      const result = await json<{ items: Ticket[] }>("/account/growth/support");
      if (identity === token.value) support.value = result.items;
    } catch (failure) {
      if (identity === token.value) error.value = (failure as Error).message;
    }
  }
  async function act(action: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    try {
      await action();
    } catch (failure) {
      error.value = (failure as Error).message;
    } finally {
      busy.value = false;
    }
  }
  function cartBanner() {
    return offeredCart.value
      ? h("section", { class: "growth-banner" }, [
          h("div", [
            h("strong", "Your saved cart is waiting"),
            h(
              "p",
              `${offeredCart.value.items.length} products · current prices and availability will be checked.`,
            ),
          ]),
          h("div", { class: "growth-actions" }, [
            button(
              "Restore saved cart",
              () => restore(false),
              !catalog.value.length,
            ),
            button(
              "Merge with this cart",
              () => restore(true),
              !catalog.value.length,
            ),
            button("Keep this cart", () => {
              offeredCart.value = null;
              scheduleSave();
            }),
          ]),
        ])
      : cartError.value
        ? h("div", { class: "growth-banner", role: "alert" }, [
            cartError.value,
            button("Reload saved cart", () => void loadCart()),
          ])
        : null;
  }
  function redeem(net: number) {
    if (!eligible.value || !loyalty.value) return null;
    const rules = loyalty.value.rules;
    return h("section", { class: "growth-redeem" }, [
      h("label", { for: "loyalty-points-input" }, "Use loyalty points"),
      h(
        "p",
        { class: "growth-muted" },
        `${loyalty.value.available} points available · 1 point = ${money(rules.loyaltyYenPerPoint)} · up to ${rules.loyaltyMaxPercent}% of products after coupons.`,
      ),
      h("input", {
        id: "loyalty-points-input",
        type: "number",
        min: 0,
        max: Math.min(
          loyalty.value.available,
          loyaltyDiscount(0, loyalty.value.available, net, rules).maxPoints,
        ),
        step: 1,
        value: pointsToUse(net),
        disabled: !rules.loyaltyEnabled,
        onInput: (e: Event) =>
          (requestedPoints.value = Math.max(
            0,
            Math.floor(Number((e.target as HTMLInputElement).value)) || 0,
          )),
      }),
      discount(net) > 0
        ? h("p", `Loyalty savings: ${money(discount(net))}`)
        : null,
      !rules.loyaltyEnabled
        ? h("p", "Loyalty earning and redemption are currently paused.")
        : null,
    ]);
  }
  function loyaltyPage() {
    if (!token.value)
      return [
        h("section", { class: "growth-card" }, [
          h("h1", "Loyalty rewards"),
          h("p", "Sign in to earn and redeem points."),
          button("Sign in", openLogin),
        ]),
      ];
    if (!eligible.value)
      return [
        h("section", { class: "growth-card" }, [
          h("h1", "Loyalty rewards"),
          h("p", "Use a verified account for saved carts and loyalty points."),
        ]),
      ];
    const data = loyalty.value;
    return [
      h("div", { class: "growth-page" }, [
        h("section", { class: "growth-card" }, [
          h("h1", "Loyalty rewards"),
          h("span", { class: "growth-status" }, data?.tier ?? "Member"),
          h("strong", { class: "growth-metric" }, String(data?.available ?? 0)),
          h("p", "Available points"),
          h(
            "p",
            `Earn 1 point per ${money(data?.rules.loyaltyEarnEvery ?? 100)} of eligible paid product value. Redeem at checkout.`,
          ),
          h(
            "p",
            { class: "growth-muted" },
            "Points are earned after payment, including simulated payments in this local demo. Unpaid COD earns no points. Cancelled or refunded orders restore redeemed points and reverse earned points. Points are not cash.",
          ),
          data && data.balance < 0
            ? h(
                "p",
                `Adjustment balance: ${data.balance}. Future earnings cover this balance before points become available.`,
              )
            : null,
          button("Refresh rewards", () => void loadLoyalty()),
        ]),
        h("section", { class: "growth-card" }, [
          h("h2", "Points history"),
          ...(data?.history ?? []).map((item) =>
            h("div", { class: "growth-row" }, [
              h("div", [
                h("strong", item.reason),
                h(
                  "small",
                  `${date(item.createdAt)} · ${item.orderId.slice(0, 8).toUpperCase()}`,
                ),
              ]),
              h("strong", `${item.delta > 0 ? "+" : ""}${item.delta}`),
            ]),
          ),
          !data?.history.length
            ? h(
                "p",
                "Your points history starts with your next eligible order.",
              )
            : null,
        ]),
        error.value
          ? h("div", { class: "error-banner", role: "alert" }, error.value)
          : null,
      ]),
    ];
  }
  function supportPage() {
    const current = support.value.find((t) => t.id === selectedTicket.value);
    return [
      h("div", { class: "growth-page" }, [
        h("section", { class: "growth-card" }, [
          h("h1", "Customer support"),
          h("p", settings.value.businessHours),
          settings.value.supportEmail
            ? h("p", [
                "Email: ",
                h(
                  "a",
                  { href: `mailto:${settings.value.supportEmail}` },
                  settings.value.supportEmail,
                ),
              ])
            : null,
          settings.value.supportPhone
            ? h("p", `Phone: ${settings.value.supportPhone}`)
            : null,
          h("h3", "Returns policy"),
          h("p", { class: "growth-policy" }, settings.value.returnPolicy),
        ]),
        !token.value
          ? h("section", { class: "growth-card" }, [
              h("p", "Sign in to send a support request and see replies."),
              button("Sign in", openLogin),
            ])
          : h("section", { class: "growth-card" }, [
              h("h2", "Open a support request"),
              ...(
                [
                  ["subject", "Subject"],
                  ["orderId", "Order ID (optional)"],
                  ["message", "How can we help?"],
                ] as const
              ).map(([key, label]) =>
                h("label", { class: "field" }, [
                  h("span", label),
                  h(key === "message" ? "textarea" : "input", {
                    value: ticket[key],
                    maxLength:
                      key === "message" ? 2000 : key === "orderId" ? 36 : 120,
                    onInput: (e: Event) =>
                      (ticket[key] = (e.target as HTMLInputElement).value),
                  }),
                ]),
              ),
              button(
                "Send request",
                () =>
                  void act(async () => {
                    support.value = (
                      await json<{ items: Ticket[] }>(
                        "/account/growth/support",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            subject: ticket.subject,
                            message: ticket.message,
                            ...(ticket.orderId
                              ? { orderId: ticket.orderId }
                              : {}),
                          }),
                        },
                      )
                    ).items;
                    Object.assign(ticket, {
                      subject: "",
                      message: "",
                      orderId: "",
                    });
                    notify("Support request sent. Replies appear here.");
                  }),
                busy.value || !ticket.subject.trim() || !ticket.message.trim(),
              ),
              h(
                "p",
                { class: "growth-muted" },
                "Replies appear on this page. Check back for updates.",
              ),
            ]),
        token.value
          ? h("section", { class: "growth-card" }, [
              h("h2", "Your requests"),
              h(
                "div",
                { class: "growth-list" },
                support.value.map((t) =>
                  h("div", { class: "growth-row" }, [
                    h(
                      "button",
                      {
                        class: "growth-ticket-button",
                        onClick: () => {
                          selectedTicket.value = t.id;
                          reply.value = "";
                        },
                      },
                      [h("strong", t.subject), h("small", date(t.updatedAt))],
                    ),
                    h(
                      "span",
                      { class: "growth-status" },
                      t.status.replaceAll("_", " "),
                    ),
                  ]),
                ),
              ),
              !support.value.length ? h("p", "No support requests yet.") : null,
              button("Refresh requests", () => void loadSupport()),
            ])
          : null,
        current
          ? h("section", { class: "growth-card" }, [
              h("h2", current.subject),
              h(
                "div",
                { class: "growth-conversation" },
                current.messages.map((m) =>
                  h("div", { class: `growth-message ${m.sender}` }, [
                    h("small", `${m.sender} · ${date(m.createdAt)}`),
                    m.message,
                  ]),
                ),
              ),
              h("label", { class: "field" }, [
                h("span", "Your reply"),
                h("textarea", {
                  value: reply.value,
                  maxLength: 2000,
                  onInput: (e: Event) =>
                    (reply.value = (e.target as HTMLTextAreaElement).value),
                }),
              ]),
              button(
                "Send reply",
                () =>
                  void act(async () => {
                    support.value = (
                      await json<{ items: Ticket[] }>(
                        `/account/growth/support/${current.id}/reply`,
                        {
                          method: "POST",
                          body: JSON.stringify({ message: reply.value }),
                        },
                      )
                    ).items;
                    reply.value = "";
                  }),
                busy.value || !reply.value.trim(),
              ),
            ])
          : null,
        error.value
          ? h("div", { class: "error-banner", role: "alert" }, error.value)
          : null,
      ]),
    ];
  }
  const forOrder=(id:string)=>{ticket.orderId=id;if(!ticket.subject)ticket.subject="Order support";};
  return {
    forOrder,settings,
    eligible,
    requestedPoints,
    loadSettings,
    loadLoyalty,
    loadSupport,
    loyaltyPage,
    supportPage,
    cartBanner,
    redeem,
    pointsToUse,
    discount,
  };
}
