import { useStaffGrowth } from "./store-growth.ts";
import { useProductPhoto } from "./product-photo.ts";
import "./product-photo.css";
import { workspaceRequest } from "./workspace-request.ts";
import {
  SUBCATEGORIES,
  productSubcategory,
  readSubcategory,
  setSubcategory,
} from "../../../packages/ui/src/product-subcategories.ts";
import "./inventory-categories.css";
import {
  cleanProductDescription,
  discountedPrice,
  PRODUCT_CATEGORIES,
  productDetails,
} from "../../../packages/api-contracts/src/product-details.ts";
import { saleWindow } from "../../../packages/api-contracts/src/scheduled-price.ts";
import { trackingLabel } from "../../../packages/ui/src/order-tracking.ts";
import { themeToggle } from "../../../packages/ui/src/theme.ts";
import type { SalesReport } from "./sales-dashboard.ts";
import { salesDashboard } from "./sales-dashboard.ts";
import { useStaffShopping } from "./shopping-tools.ts";
import "./analytics.css";
import {
  computed,
  createApp,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import {
  h,
  language,
  languageSelect,
  locale,
} from "../../../packages/ui/src/language.ts";
import type { Order, Product } from "../../../packages/ui/src/storefront.ts";
import {
  adminToken,
  artSvg,
  category,
  date,
  iconSvg,
  money,
} from "../../../packages/ui/src/storefront.ts";
import "./style.css";
import "./product-editor.css";
import "../../../packages/ui/src/theme.css";
import type { StockReport } from "./stock-chart.ts";
import { stockCharts } from "./stock-chart.ts";

const icon = (name: string) =>
  h("span", { class: "icon", innerHTML: iconSvg(name) });
const btn = (
  label: string,
  action: () => void,
  kind = "primary",
  disabled = false,
  symbol?: string,
) =>
  h(
    "button",
    { type: "button", class: `btn ${kind}`, onClick: action, disabled },
    [symbol ? icon(symbol) : null, label],
  );
type Activity = {
  id: string;
  productCode: string;
  productName: string;
  delta: number;
  stockAfter: number;
  reason: string;
  createdAt: string;
};
type Stats = {
  products: number;
  units: number;
  low: number;
  out: number;
  confirmed: number;
  revenue: number;
  daily: Array<{ day: string; orders: number }>;
};
createApp({
  setup() {
    const incoming = new URLSearchParams(location.hash.slice(1)).get(
      "training2-token",
    );
    if (incoming) {
      sessionStorage.setItem("training2.admin", incoming);
      history.replaceState(null, "", location.pathname + location.search);
    }
    const token = ref(sessionStorage.getItem("training2.admin") ?? "");
    const page = ref<
      | "overview"
      | "inventory"
      | "orders"
      | "activity"
      | "prices"
      | "variants"
      | "returns" | "support" | "targets" | "recovery" | "settings" | "staff"
    >("overview");
    const sales = ref<SalesReport | null>(null),
      salesDays = ref(7);
    watch(salesDays, async (requestedDays) => {
      sales.value = null;
      if (!token.value || !growth.can("analytics:view")) return;
      try {
        const result = await request(`/store/analytics?days=${requestedDays}`);
        if (salesDays.value === requestedDays) sales.value = result;
      } catch (failure) {
        error.value = (failure as Error).message;
      }
    });
    const stockChart = ref<StockReport | null>(null),
      chartProduct = ref(""),
      chartDays = ref(7);
    const products = ref<Product[]>([]),
      orders = ref<Order[]>([]),
      activities = ref<Activity[]>([]),
      orderTotal = ref(0),
      orderPage = ref(1);
    const stats = ref<Stats>({
      products: 0,
      units: 0,
      low: 0,
      out: 0,
      confirmed: 0,
      revenue: 0,
      daily: [],
    });
    const inventoryCategory = ref(""),
      inventorySubcategory = ref(""),
      productType = ref("");
    watch(inventoryCategory, () => {
      inventorySubcategory.value = "";
    });
    const search = ref(""),
      stockFilter = ref("all"),
      inventoryPage = ref(1),
      loading = ref(false),
      busy = ref(false),
      online = ref(true),
      lastSync = ref("");
    const error = ref(""),
      notice = ref(""),
      modal = ref<"product" | "stock" | "delete" | null>(null),
      selected = ref<Product | null>(null);
    const login = reactive({
      username: "admin@example.test",
      password: "Training2-local!",
    });
    const form = reactive({
      name: "",
      description: "",
      price: "",
      stock: "",
      category: "Tech & audio",
      discountPercent: "0",
    });
    const photo = useProductPhoto();
    const saleSchedule = reactive({ enabled: false, start: "", end: "" });
    const localDate = (value?: string) => {
      if (!value) return "";
      const d = new Date(value);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    };
    const adjustment = reactive({
      mode: "add",
      quantity: "10",
      reason: "Stock replenishment",
    });
    let timer: ReturnType<typeof setInterval> | undefined,
      noticeTimer: ReturnType<typeof setTimeout> | undefined,
      active: Promise<void> | null = null,
      previousFocus: HTMLElement | null = null;
    const growth = useStaffGrowth(request,notify);
    const shopping = useStaffShopping(
      request,
      products,
      notify,
      refresh,
      (id) => {
        const product = products.value.find((p) => p.id === id);
        if (product) open("product", product);
      },
      (id) => {
        const product = products.value.find((p) => p.id === id);
        if (product) open("delete", product);
      },
      ()=>growth.can("refunds:write"),
    );
    function notify(text: string) {
      notice.value = text;
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => (notice.value = ""), 5000);
    }
    function signOut() {
      token.value = "";
      sessionStorage.removeItem("training2.admin");
      products.value = [];
      orders.value = [];
      activities.value = [];
      modal.value = null;
      login.password = "";
      error.value = "";
    }
    async function request(path: string, options: RequestInit = {}) {
      const headers = new Headers(options.headers);
      headers.set("Content-Type", "application/json");
      if (token.value) headers.set("Authorization", `Bearer ${token.value}`);
      const { response, body } = await workspaceRequest(`/api${path}`, { ...options, headers });
      if (!response.ok) {
        if (response.status === 401 && token.value) signOut();
        throw new Error(body?.message ?? "The request could not be completed.");
      }
      return body;
    }
    function refresh(): Promise<void> {
      if (!token.value) return Promise.resolve();
      if (active) return active;
      active = (async () => {
        loading.value = true;
        try {
          await growth.me();
          if(!growth.pageAllowed(page.value)) page.value = growth.role.value === "inventory" ? "inventory" : "orders";
          const requestedDays = salesDays.value;
          const [first, orderList, eventList, overview, report, chart] =
            await Promise.all([
              request("/products?pageSize=100"),
              growth.can("orders:view") ? request(`/store/orders?page=${orderPage.value}&pageSize=10`) : Promise.resolve({items:[],total:0}),
              request("/store/inventory/events"),
              growth.can("analytics:view") ? request("/store/overview") : Promise.resolve(stats.value),
              growth.can("analytics:view") ? request(`/store/analytics?days=${requestedDays}`) : Promise.resolve(null),
              growth.can("analytics:view") ? request(
                "/store/inventory/chart?days=" +
                  chartDays.value +
                  (chartProduct.value
                    ? `&productId=${chartProduct.value}`
                    : ""),
              ) : Promise.resolve(null),
            ]);
          let all: Product[] = first.items;
          for (let p = 2; p <= Math.ceil(first.total / 100); p++) {
            const next = await request(`/products?page=${p}&pageSize=100`);
            all = all.concat(next.items);
          }
          products.value = all;
          if(["prices","variants","returns"].includes(page.value)) await shopping.refresh(page.value);
          if(["support","targets","recovery"].includes(page.value)) await growth.load(page.value);
          orders.value = orderList.items;
          orderTotal.value = orderList.total;
          activities.value = eventList.items;
          stats.value = overview;
          if (salesDays.value === requestedDays) sales.value = report;
          stockChart.value = chart;
          online.value = true;
          lastSync.value = new Date().toLocaleTimeString(locale());
        } catch (failure) {
          online.value = false;
          error.value = (failure as Error).message;
        } finally {
          loading.value = false;
          active = null;
        }
      })();
      return active;
    }
    function chartView() {
      return stockCharts(
        stockChart.value,
        products.value,
        chartProduct.value,
        chartDays.value,
        (id) => (chartProduct.value = id),
        (days) => (chartDays.value = days),
      );
    }
    watch([chartProduct, chartDays], () => {
      void refresh()
        .then(async () => {
          if (token.value && growth.can("analytics:view"))
            stockChart.value = await request(
              "/store/inventory/chart?days=" +
                chartDays.value +
                (chartProduct.value ? `&productId=${chartProduct.value}` : ""),
            );
        })
        .catch((failure) => (error.value = failure.message));
    });
    async function signIn(event: Event) {
      event.preventDefault();
      if (busy.value) return;
      busy.value = true;
      error.value = "";
      try {
        const result = await request("/auth/login", {
          method: "POST",
          body: JSON.stringify(login),
        });
        if (!result?.token || !result.role || result.role === "disabled")
          throw new Error(
            "A staff account with workspace access is required.",
          );
        token.value = result.token;
        sessionStorage.setItem("training2.admin", result.token);
        login.password = "";
        await refresh();
      } catch (failure) {
        error.value = (failure as Error).message;
      } finally {
        busy.value = false;
      }
    }
    function changePage(target: typeof page.value) {
      page.value = target;
      if(["prices","variants","returns"].includes(target)) void shopping.refresh(target);
      if(["support","targets","recovery","settings","staff"].includes(target)) void growth.load(target);
      search.value = "";
      error.value = "";
    }
    function open(type: typeof modal.value, product: Product | null = null) {
      selected.value = product;
      error.value = "";
      if (type === "product")
        Object.assign(form, {
          name: product?.name ?? "",
          description: product
            ? cleanProductDescription(product.description)
            : "",
          category: product ? productDetails(product).category : "Tech & audio",
          discountPercent: product
            ? String(productDetails(product).discountPercent)
            : "0",
          price: product ? String(productDetails(product).basePrice) : "",
          stock: product ? String(product.stock) : "",
        });
      if (type === "product") {
        photo.reset(product?.imageUrl ?? "");
        productType.value = product
          ? (readSubcategory(product.description) ?? "")
          : "";
        const window = product ? saleWindow(product) : null;
        Object.assign(saleSchedule, {
          enabled: !!window,
          start: localDate(window?.startsAt),
          end: localDate(window?.endsAt),
        });
      }
      if (type === "stock")
        Object.assign(adjustment, {
          mode: "add",
          quantity: "10",
          reason: "Stock replenishment",
        });
      modal.value = type;
    }
    function close() {
      if (!busy.value) modal.value = null;
    }
    watch(modal, async (value) => {
      if (value) {
        previousFocus = document.activeElement as HTMLElement;
        await nextTick();
        document.querySelector<HTMLInputElement>(".dialog input")?.focus();
      } else previousFocus?.focus();
    });
    watch(
      [search, stockFilter, inventoryCategory, inventorySubcategory],
      () => (inventoryPage.value = 1),
    );
    async function saveProduct(event: Event) {
      event.preventDefault();
      if (busy.value || photo.processing.value) return;
      busy.value = true;
      error.value = "";
      try {
        if (photo.error.value) throw new Error(photo.error.value);
        if (
          saleSchedule.enabled &&
          (!saleSchedule.start ||
            !saleSchedule.end ||
            Date.parse(saleSchedule.end) <= Date.parse(saleSchedule.start) ||
            Number(form.discountPercent) <= 0)
        )
          throw new Error(
            "Choose a positive discount and an end time after the start time.",
          );
        const product = selected.value;
        await request(product ? `/products/${product.id}` : "/products", {
          method: product ? "PUT" : "POST",
          body: JSON.stringify({
            ...form,
            ...(photo.data.value !== undefined ? {imageData:photo.data.value} : {}),
            description: setSubcategory(form.description, productType.value),
            price: Number(form.price),
            stock: Number(form.stock),
            discountPercent: Number(form.discountPercent),
            offerStartsAt: saleSchedule.enabled
              ? new Date(saleSchedule.start).toISOString()
              : null,
            offerEndsAt: saleSchedule.enabled
              ? new Date(saleSchedule.end).toISOString()
              : null,
            ...(product ? { expectedUpdatedAt: product.updatedAt } : {}),
          }),
        });
        modal.value = null;
        notify(
          product ? "Product updated." : "Your new product is in the shop.",
        );
        await refresh();
      } catch (failure) {
        error.value = (failure as Error).message;
      } finally {
        busy.value = false;
      }
    }
    async function saveStock(event: Event) {
      event.preventDefault();
      if (busy.value || !selected.value) return;
      busy.value = true;
      error.value = "";
      try {
        const quantity = Number(adjustment.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0)
          throw new Error("Enter a positive whole number.");
        await request(`/store/inventory/${selected.value.id}/adjust`, {
          method: "POST",
          body: JSON.stringify({
            delta: adjustment.mode === "add" ? quantity : -quantity,
            reason: adjustment.reason,
          }),
        });
        modal.value = null;
        notify("Stock updated. The shop will refresh automatically.");
        await refresh();
      } catch (failure) {
        error.value = (failure as Error).message;
      } finally {
        busy.value = false;
      }
    }
    async function remove() {
      if (busy.value || !selected.value) return;
      busy.value = true;
      error.value = "";
      try {
        await request(`/products/${selected.value.id}`, { method: "DELETE" });
        modal.value = null;
        notify("Product removed from the catalog.");
        await refresh();
      } catch (failure) {
        error.value = (failure as Error).message;
      } finally {
        busy.value = false;
      }
    }
    const filtered = computed(() =>
      products.value.filter(
        (p) =>
          (!inventoryCategory.value ||
            category(p) === inventoryCategory.value) &&
          (!inventorySubcategory.value ||
            productSubcategory(p, category(p)) ===
              inventorySubcategory.value) &&
          `${p.name} ${p.code}`
            .toLowerCase()
            .includes(search.value.toLowerCase()) &&
          (stockFilter.value === "all" ||
            (stockFilter.value === "low" && p.stock > 0 && p.stock <= 5) ||
            (stockFilter.value === "out" && p.stock === 0)),
      ),
    );
    const rows = computed(() =>
      filtered.value.slice(
        (inventoryPage.value - 1) * 10,
        inventoryPage.value * 10,
      ),
    );
    const low = computed(() =>
      products.value
        .filter((p) => p.stock <= 5)
        .sort((a, b) => a.stock - b.stock),
    );
    function resume() {
      if (document.visibilityState === "visible") void refresh();
    }
    function keyboard(e: KeyboardEvent) {
      if (!modal.value) return;
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".dialog input,.dialog select,.dialog textarea,.dialog button:not(:disabled)",
          ),
        );
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    onMounted(() => {
      void refresh();
      timer = setInterval(resume, 4000);
      window.addEventListener("focus", resume);
      document.addEventListener("visibilitychange", resume);
      document.addEventListener("keydown", keyboard);
    });
    onBeforeUnmount(() => {
      clearInterval(timer);
      clearTimeout(noticeTimer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      document.removeEventListener("keydown", keyboard);
    });
    const tag = (p: Product) =>
      h(
        "span",
        {
          class: `badge ${p.stock === 0 ? "cancelled" : p.stock <= 5 ? "pending" : "confirmed"}`,
        },
        p.stock === 0
          ? "Out of stock"
          : p.stock <= 5
            ? "Low stock"
            : "In stock",
      );
    function metrics() {
      return h(
        "div",
        { class: "metrics" },
        [
          [
            "box",
            "Catalog products",
            stats.value.products,
            "Products in your shop",
          ],
          ["chart", "Available units", stats.value.units, "Ready to order"],
          [
            "clock",
            "Low / out of stock",
            stats.value.low + stats.value.out,
            "Items that need attention",
          ],
          [
            "cart",
            "Confirmed order value",
            money(stats.value.revenue),
            `${stats.value.confirmed} confirmed orders · saved receipts`,
          ],
        ].map(([i, label, value, caption]) =>
          h("article", { class: "card metric" }, [
            h("div", { class: "metric-top" }, [
              h("span", label),
              icon(String(i)),
            ]),
            h("strong", String(value)),
            h("small", caption),
          ]),
        ),
      );
    }
    function ordersTable() {
      return h("div", { class: "table-scroll staff-orders-scroll" }, [
        h("table", { class: "staff-orders-table" }, [
          h("thead", [
            h(
              "tr",
              [
                "Order",
                "Placed",
                "Items",
                "Total",
                "Status",
                "Payment",
                "Delivery",
              ].map((t) => h("th", t)),
            ),
          ]),
          h(
            "tbody",
            orders.value.length
              ? orders.value.map((order) =>
                  h("tr", { key: order.id }, [
                    h("td", [
                      h("strong", `#${order.id.slice(0, 8).toUpperCase()}`),
                      h("small", order.receipt?.recipient?.name ?? "Customer"),
                    ]),
                    h("td", date(order.createdAt)),
                    h(
                      "td",
                      order.items.reduce((s, i) => s + i.quantity, 0),
                    ),
                    h(
                      "td",
                      order.receipt
                        ? money(order.receipt.total)
                        : "Earlier order",
                    ),
                    h(
                      "td",
                      h(
                        "span",
                        { class: `badge ${order.status}` },
                        order.status,
                      ),
                    ),
                    h("td", { class: "staff-payment-cell" }, [
                      order.receipt?.payment
                        ? h("span", [
                            h(
                              "strong",
                              order.receipt.payment.provider.toUpperCase() +
                                " · " +
                                order.receipt.payment.state,
                            ),
                            h(
                              "small",
                              money(
                                order.receipt.payment.amountMinor /
                                  (order.receipt.payment.currency === "INR"
                                    ? 100
                                    : 1),
                                order.receipt.payment.currency,
                              ),
                            ),
                          ])
                        : h("small", "Earlier training order"),
                      order.status === "confirmed" &&
                      order.receipt?.payment?.provider === "cod" &&
                      order.receipt.payment.state === "due" && growth.can("orders:write")
                        ? btn(
                            "Record cash collected",
                            () => void collectCash(order),
                            "secondary small",
                            busy.value,
                          )
                        : null,
                    ]),
                    h("td", { class: "staff-delivery-cell" }, [
                      h(
                        "span",
                        { class: "staff-delivery-status" },
                        order.status === "confirmed"
                          ? trackingLabel(
                              order.receipt?.tracking?.stage ?? "confirmed",
                            )
                          : "—",
                      ),
                      order.status === "confirmed"
                        ? h("small", "Automatic demo timeline")
                        : null,
                      order.status === "confirmed" &&
                      order.receipt?.tracking?.expectedDeliveryAt
                        ? h(
                            "small",
                            `Arrival · ${date(order.receipt.tracking.expectedDeliveryAt)}`,
                          )
                        : null,
                    ]),
                  ]),
                )
              : [
                  h("tr", [
                    h(
                      "td",
                      { colspan: 7, class: "table-empty" },
                      "New orders will appear here.",
                    ),
                  ]),
                ],
          ),
        ]),
      ]);
    }
    function activityList(limit = 60) {
      return h(
        "div",
        { class: "activity-list" },
        activities.value.length
          ? activities.value.slice(0, limit).map((item) =>
              h("article", { class: "activity-row", key: item.id }, [
                h(
                  "span",
                  {
                    class: `activity-delta ${item.delta > 0 ? "positive" : "negative"}`,
                  },
                  `${item.delta > 0 ? "+" : ""}${item.delta}`,
                ),
                h("div", [
                  h("strong", item.productName),
                  h("p", item.reason),
                  h("small", `${item.productCode} · ${date(item.createdAt)}`),
                ]),
                h("span", { class: "activity-after" }, [
                  h("strong", String(item.stockAfter)),
                  h("small", "remaining"),
                ]),
              ]),
            )
          : [
              h(
                "p",
                { class: "muted" },
                "Purchases, cancellations and adjustments will appear here.",
              ),
            ],
      );
    }
    async function collectCash(order: Order) {
      if (busy.value) return;
      busy.value = true;
      error.value = "";
      try {
        await request(`/store/orders/${order.id}/cod-collected`, {
          method: "POST",
        });
        notify("Cash collection recorded. Stock was not changed.");
        await refresh();
      } catch (failure) {
        error.value = (failure as Error).message;
      } finally {
        busy.value = false;
      }
    }
    function dashboard() {
      return [
        salesDashboard(
          sales.value,
          salesDays.value,
          (d) => (salesDays.value = d),
          (message) => (error.value = message),
        ),
        metrics(),
        chartView(),
        h("div", { class: "dashboard-grid" }, [
          h("section", { class: "card chart-card" }, [
            h("div", { class: "card-heading" }, [
              h("div", [
                h("h2", "A week in your shop"),
                h(
                  "p",
                  { class: "muted" },
                  "Confirmed orders by day · database time",
                ),
              ]),
              h("span", { class: "badge confirmed" }, "Last 7 days"),
            ]),
            h(
              "div",
              {
                class: "bar-chart",
                role: "img",
                "aria-label": stats.value.daily
                  .map((d) => `${d.day}: ${d.orders} orders`)
                  .join(", "),
              },
              stats.value.daily.map((day) =>
                h("div", { class: "bar-column" }, [
                  h("span", String(day.orders)),
                  h("div", { class: "bar-track" }, [
                    h("div", {
                      class: "bar",
                      style: {
                        height: `${day.orders ? Math.max(5, (day.orders / Math.max(1, ...stats.value.daily.map((d) => d.orders))) * 100) : 1}%`,
                      },
                    }),
                  ]),
                  h("small", day.day),
                ]),
              ),
            ),
          ]),
          h("section", { class: "card attention-card" }, [
            h("div", { class: "card-heading" }, [
              h("h2", "Needs a little attention"),
              icon("box"),
            ]),
            h(
              "p",
              { class: "muted" },
              "Keep your everyday essentials ready to go.",
            ),
            low.value.length
              ? low.value
                  .slice(0, 4)
                  .map((p) =>
                    h("div", { class: "low-row" }, [
                      h("div", { class: "mini-art", innerHTML: artSvg(p) }),
                      h("span", [
                        h("strong", p.name),
                        h("small", `${p.stock} remaining`),
                      ]),
                      btn("Restock", () => open("stock", p), "secondary small"),
                    ]),
                  )
              : h("div", { class: "healthy-state" }, [
                  icon("check"),
                  h("strong", "Stock is looking good"),
                  h("p", "No low-stock items right now."),
                ]),
          ]),
        ]),
        h("section", { class: "card" }, [
          h("div", { class: "card-heading padded" }, [
            h("div", [
              h("h2", "Recent orders"),
              h(
                "p",
                { class: "muted" },
                "The latest activity from your customers.",
              ),
            ]),
            btn(
              "View all orders",
              () => changePage("orders"),
              "text",
              false,
              "arrow",
            ),
          ]),
          ordersTable(),
        ]),
        h("section", { class: "card padded" }, [
          h("div", { class: "card-heading" }, [
            h("h2", "Stock activity"),
            btn(
              "View activity",
              () => changePage("activity"),
              "text",
              false,
              "arrow",
            ),
          ]),
          activityList(5),
        ]),
      ];
    }
    function scheduleStatus(product: Product) {
      const window = saleWindow(product);
      if (!window)
        return productDetails(product).discountPercent > 0
          ? "Offer active"
          : "";
      return Date.now() < Date.parse(window.startsAt)
        ? `Offer scheduled · ${date(window.startsAt)}`
        : Date.now() >= Date.parse(window.endsAt)
          ? `Offer ended · ${date(window.endsAt)}`
          : `Offer active until ${date(window.endsAt)}`;
    }
    function inventory() {
      return [
        salesDashboard(
          sales.value,
          salesDays.value,
          (d) => (salesDays.value = d),
          (message) => (error.value = message),
        ),
        metrics(),
        chartView(),
        h("section", { class: "card" }, [
          h("div", { class: "inventory-toolbar" }, [
            h("label", { class: "search-box" }, [
              icon("search"),
              h("input", {
                placeholder: "Search by product name or code",
                value: search.value,
                "aria-label": "Search inventory",
                onInput: (e: Event) =>
                  (search.value = (e.target as HTMLInputElement).value),
              }),
            ]),
            h(
              "select",
              {
                value: stockFilter.value,
                "aria-label": "Filter stock",
                onChange: (e: Event) =>
                  (stockFilter.value = (e.target as HTMLSelectElement).value),
              },
              [
                h("option", { value: "all" }, "All stock levels"),
                h("option", { value: "low" }, "Low stock"),
                h("option", { value: "out" }, "Out of stock"),
              ],
            ),
            h("span", { class: "muted" }, `${filtered.value.length} products`),
          ]),
          h("div", { class: "inventory-category-filters" }, [
            h("label", [
              h("span", "Product category"),
              h(
                "select",
                {
                  value: inventoryCategory.value,
                  "aria-label": "Filter category",
                  onChange: (event: Event) => {
                    inventoryCategory.value = (
                      event.target as HTMLSelectElement
                    ).value;
                  },
                },
                [
                  h("option", { value: "" }, "All categories"),
                  ...PRODUCT_CATEGORIES.map((value) =>
                    h("option", { value }, value),
                  ),
                ],
              ),
            ]),
            h("label", [
              h("span", "Product subcategory"),
              h(
                "select",
                {
                  value: inventorySubcategory.value,
                  "aria-label": "Filter subcategory",
                  onChange: (event: Event) => {
                    inventorySubcategory.value = (
                      event.target as HTMLSelectElement
                    ).value;
                  },
                },
                [
                  h("option", { value: "" }, "All types"),
                  ...[
                    ...new Set([
                      ...(SUBCATEGORIES[inventoryCategory.value] ?? []),
                      ...products.value
                        .filter(
                          (p) =>
                            !inventoryCategory.value ||
                            category(p) === inventoryCategory.value,
                        )
                        .map((p) => productSubcategory(p, category(p))),
                    ]),
                  ]
                    .sort()
                    .map((value) => h("option", { value }, value)),
                ],
              ),
            ]),
            btn(
              "Clear filters",
              () => {
                inventoryCategory.value = "";
                inventorySubcategory.value = "";
                stockFilter.value = "all";
                search.value = "";
              },
              "secondary",
            ),
          ]),
          h("div", { class: "table-scroll" }, [
            h("table", { class: "inventory-table" }, [
              h("thead", [
                h(
                  "tr",
                  [
                    "Product",
                    "Code",
                    "Product subcategory",
                    "Price",
                    "Available",
                    "Status",
                    "Actions",
                  ].map((t) => h("th", t)),
                ),
              ]),
              h(
                "tbody",
                rows.value.length
                  ? rows.value.map((p) =>
                      h("tr", { key: p.id }, [
                        h("td", [
                          h("div", { class: "table-product" }, [
                            h("div", {
                              class: "mini-art",
                              innerHTML: artSvg(p),
                            }),
                            h("span", [
                              h("strong", p.name),
                              h("small", category(p)),
                              h("small", scheduleStatus(p)),
                            ]),
                          ]),
                        ]),
                        h("td", h("code", p.code)),
                        h(
                          "td",
                          h(
                            "span",
                            { class: "inventory-subcategory-pill" },
                            productSubcategory(p, category(p)),
                          ),
                        ),
                        h("td", money(p.price)),
                        h(
                          "td",
                          h(
                            "strong",
                            { class: p.stock <= 5 ? "amber" : "" },
                            String(p.stock),
                          ),
                        ),
                        h("td", tag(p)),
                        h("td", [
                          h("div", { class: "table-actions" }, [
                            btn(
                              "Adjust stock",
                              () => open("stock", p),
                              "secondary small",
                              busy.value,
                              "plus",
                            ),
                            h(
                              "button",
                              {
                                class: "icon-button",
                                "aria-label": `Edit ${p.name}`,
                                onClick: () => open("product", p),
                              },
                              icon("edit"),
                            ),
                            h(
                              "button",
                              {
                                class: "icon-button danger",
                                "aria-label": `Delete ${p.name}`,
                                onClick: () => open("delete", p),
                              },
                              icon("trash"),
                            ),
                          ]),
                        ]),
                      ]),
                    )
                  : [
                      h("tr", [
                        h(
                          "td",
                          { colspan: 7, class: "table-empty" },
                          products.value.length
                            ? "No products match your filters."
                            : "Your catalog is empty. Add your first product to get started.",
                        ),
                      ]),
                    ],
              ),
            ]),
          ]),
          h("div", { class: "pager" }, [
            btn(
              "Previous",
              () => inventoryPage.value--,
              "secondary",
              inventoryPage.value <= 1,
            ),
            h(
              "span",
              `Page ${inventoryPage.value} of ${Math.max(1, Math.ceil(filtered.value.length / 10))}`,
            ),
            btn(
              "Next",
              () => inventoryPage.value++,
              "secondary",
              inventoryPage.value * 10 >= filtered.value.length,
            ),
          ]),
        ]),
      ];
    }
    function productField(
      key: keyof typeof form,
      label: string,
      numeric = false,
    ) {
      return h("label", { class: "field" }, [
        h("span", label),
        h(key === "description" ? "textarea" : "input", {
          value: form[key],
          type: numeric ? "number" : "text",
          required: key !== "description",
          min: numeric ? 0 : undefined,
          max:
            key === "price"
              ? 9999999
              : key === "discountPercent"
                ? 100
                : key === "stock"
                  ? 2147483647
                  : undefined,
          step: numeric ? 1 : undefined,
          maxlength: key === "name" ? 160 : 1000,
          onInput: (e: Event) =>
            (form[key] = (e.target as HTMLInputElement).value),
        }),
      ]);
    }
    function dialog() {
      if (!modal.value) return null;
      return h(
        "div",
        {
          class: "modal-backdrop",
          onClick: (e: MouseEvent) => {
            if (e.target === e.currentTarget) close();
          },
        },
        [
          h(
            "section",
            {
              class:
                modal.value === "product"
                  ? "dialog product-editor-dialog"
                  : "dialog",
              role: "dialog",
              "aria-modal": true,
              "aria-labelledby": "modal-title",
            },
            [
              h(
                "button",
                {
                  class: "icon-button close-dialog",
                  "aria-label": "Close dialog",
                  onClick: close,
                  disabled: busy.value,
                },
                icon("close"),
              ),
              h(
                "span",
                { class: "eyebrow" },
                modal.value === "stock" ? "INVENTORY CONTROL" : "CATALOG",
              ),
              h(
                "h2",
                { id: "modal-title" },
                modal.value === "product"
                  ? selected.value
                    ? "Edit your product"
                    : "Add a good find"
                  : modal.value === "stock"
                    ? "Keep your shelves ready"
                    : "Remove this product?",
              ),
              selected.value
                ? h(
                    "p",
                    { class: "muted" },
                    `${selected.value.name} · ${selected.value.code}`,
                  )
                : null,
              error.value
                ? h("div", { class: "form-error", role: "alert" }, error.value)
                : null,
              modal.value === "product"
                ? h(
                    "form",
                    { class: "product-editor-form", onSubmit: saveProduct },
                    [
                      h("div", { class: "editor-body" }, [
                        h("section", { class: "editor-section" }, [
                          h("div", { class: "editor-section-heading" }, [
                            h("span", "01"),
                            h("div", [
                              h("h3", "Product details"),
                              h("p", "Help customers find the right product."),
                            ]),
                          ]),
                          h("div", { class: "editor-details-grid" }, [
                            productField("name", "Product name"),
                            h("label", { class: "field" }, [
                              h("span", "Product category"),
                              h(
                                "select",
                                {
                                  value: form.category,
                                  onChange: (event: Event) => {
                                    productType.value = "";
                                    form.category = (
                                      event.target as HTMLSelectElement
                                    ).value;
                                  },
                                },
                                PRODUCT_CATEGORIES.map((value) =>
                                  h("option", { value }, value),
                                ),
                              ),
                            ]),
                          ]),
                          h("label", { class: "field" }, [
                            h("span", "Product subcategory"),
                            h(
                              "select",
                              {
                                value: productType.value,
                                onChange: (event: Event) => {
                                  productType.value = (
                                    event.target as HTMLSelectElement
                                  ).value;
                                },
                              },
                              [
                                h(
                                  "option",
                                  { value: "" },
                                  "Automatic (based on product name)",
                                ),
                                ...[
                                  ...new Set([
                                    ...(SUBCATEGORIES[form.category] ?? []),
                                    ...(productType.value
                                      ? [productType.value]
                                      : []),
                                  ]),
                                ].map((value) => h("option", { value }, value)),
                              ],
                            ),
                          ]),
                          h("p", { class: "editor-subcategory-preview" }, [
                            h("span", "Shop subcategory"),
                            h(
                              "strong",
                              productType.value ||
                                productSubcategory(
                                  { name: form.name },
                                  form.category,
                                ),
                            ),
                          ]),
                          productField("description", "Description"),
                          photo.editor(busy.value),
                        ]),
                        h("section", { class: "editor-section" }, [
                          h("div", { class: "editor-section-heading" }, [
                            h("span", "02"),
                            h("div", [
                              h("h3", "Price & inventory"),
                              h(
                                "p",
                                "Set the regular price, stock and offer percentage.",
                              ),
                            ]),
                          ]),
                          h("div", { class: "field-grid" }, [
                            productField("price", "Regular price (JPY)", true),
                            productField("stock", "Available stock", true),
                          ]),
                          h("div", { class: "editor-offer-grid" }, [
                            h("div", [
                              productField(
                                "discountPercent",
                                "Offer discount (%)",
                                true,
                              ),
                              h(
                                "small",
                                { class: "editor-hint" },
                                "Use 0% for the regular price. Discounts apply to existing stock too.",
                              ),
                            ]),
                            h(
                              "div",
                              {
                                class: "editor-price-preview",
                                "aria-live": "polite",
                              },
                              [
                                h(
                                  "span",
                                  saleSchedule.enabled
                                    ? "Price during scheduled sale"
                                    : "Customer price",
                                ),
                                h(
                                  "strong",
                                  money(
                                    discountedPrice(
                                      Number(form.price || 0),
                                      Number(form.discountPercent || 0),
                                    ),
                                  ),
                                ),
                                Number(form.discountPercent) > 0
                                  ? h(
                                      "small",
                                      `Save ${money(Number(form.price || 0) - discountedPrice(Number(form.price || 0), Number(form.discountPercent || 0)))} per item · ${form.discountPercent}% off`,
                                    )
                                  : h("small", "No product discount applied"),
                              ],
                            ),
                          ]),
                        ]),
                        h(
                          "section",
                          { class: "editor-section editor-scheduling" },
                          [
                            h("label", { class: "editor-sale-toggle" }, [
                              h("span", [
                                h("strong", "Schedule this offer"),
                                h(
                                  "small",
                                  "Choose exactly when the discount starts and ends.",
                                ),
                              ]),
                              h("input", {
                                class: "editor-switch",
                                type: "checkbox",
                                role: "switch",
                                "aria-label": "Schedule this offer",
                                checked: saleSchedule.enabled,
                                onChange: (event: Event) => {
                                  saleSchedule.enabled = (
                                    event.target as HTMLInputElement
                                  ).checked;
                                },
                              }),
                            ]),
                            saleSchedule.enabled
                              ? h("div", { class: "editor-schedule-panel" }, [
                                  h("div", { class: "field-grid" }, [
                                    h("label", { class: "field" }, [
                                      h("span", "Offer starts at"),
                                      h("input", {
                                        type: "datetime-local",
                                        required: true,
                                        value: saleSchedule.start,
                                        onInput: (event: Event) => {
                                          saleSchedule.start = (
                                            event.target as HTMLInputElement
                                          ).value;
                                        },
                                      }),
                                    ]),
                                    h("label", { class: "field" }, [
                                      h("span", "Offer ends at"),
                                      h("input", {
                                        type: "datetime-local",
                                        required: true,
                                        min: saleSchedule.start || undefined,
                                        value: saleSchedule.end,
                                        onInput: (event: Event) => {
                                          saleSchedule.end = (
                                            event.target as HTMLInputElement
                                          ).value;
                                        },
                                      }),
                                    ]),
                                  ]),
                                  h(
                                    "p",
                                    { class: "editor-hint" },
                                    `Times shown in ${Intl.DateTimeFormat().resolvedOptions().timeZone}. The shop shows a countdown; regular pricing returns automatically after the end time.`,
                                  ),
                                ])
                              : h(
                                  "p",
                                  { class: "editor-hint" },
                                  "Scheduling is off. Your discount applies immediately after saving.",
                                ),
                          ],
                        ),
                      ]),
                      h("div", { class: "dialog-actions editor-footer" }, [
                        error.value ? h("p", { class: "editor-save-error", role: "alert" }, error.value) : null,
                        h(
                          "small",
                          { class: "editor-footer-copy" },
                          "Changes sync to the shop after saving.",
                        ),
                        btn("Cancel", close, "secondary", busy.value),
                        h(
                          "button",
                          {
                            class: "btn primary",
                            type: "submit",
                            disabled: busy.value || photo.processing.value,
                          },
                          busy.value || photo.processing.value
                            ? "Saving…"
                            : selected.value
                              ? "Save changes"
                              : "Add product",
                        ),
                      ]),
                    ],
                  )
                : modal.value === "stock"
                  ? h("form", { onSubmit: saveStock }, [
                      h("div", { class: "stock-preview" }, [
                        h("span", "Currently available"),
                        h("strong", String(selected.value?.stock ?? 0)),
                      ]),
                      h("div", { class: "segmented" }, [
                        btn(
                          "Add stock",
                          () => {
                            adjustment.mode = "add";
                            adjustment.reason = "Stock replenishment";
                          },
                          adjustment.mode === "add" ? "active" : "plain",
                        ),
                        btn(
                          "Remove stock",
                          () => {
                            adjustment.mode = "remove";
                            adjustment.reason = "Inventory correction";
                          },
                          adjustment.mode === "remove" ? "active" : "plain",
                        ),
                      ]),
                      h("label", { class: "field" }, [
                        h("span", "Quantity"),
                        h("input", {
                          type: "number",
                          min: 1,
                          max: 1000000,
                          step: 1,
                          required: true,
                          value: adjustment.quantity,
                          onInput: (e: Event) =>
                            (adjustment.quantity = (
                              e.target as HTMLInputElement
                            ).value),
                        }),
                      ]),
                      h("label", { class: "field" }, [
                        h("span", "Reason"),
                        h("input", {
                          required: true,
                          maxlength: 200,
                          value: adjustment.reason,
                          onInput: (e: Event) =>
                            (adjustment.reason = (
                              e.target as HTMLInputElement
                            ).value),
                        }),
                      ]),
                      h(
                        "p",
                        { class: "fine-print" },
                        "The adjustment is applied to the latest saved stock. Other open screens refresh within 4 seconds.",
                      ),
                      h("div", { class: "dialog-actions" }, [
                        btn("Cancel", close, "secondary", busy.value),
                        h(
                          "button",
                          {
                            class: "btn primary",
                            type: "submit",
                            disabled: busy.value,
                          },
                          busy.value ? "Updating…" : "Update stock",
                        ),
                      ]),
                    ])
                  : [
                      h(
                        "p",
                        "Products already used in an order cannot be deleted. You can set their available stock to zero instead.",
                      ),
                      h("div", { class: "dialog-actions" }, [
                        btn("Keep product", close, "secondary", busy.value),
                        btn(
                          busy.value ? "Removing…" : "Remove product",
                          () => void remove(),
                          "danger-solid",
                          busy.value,
                        ),
                      ]),
                    ],
            ],
          ),
        ],
      );
    }
    function loginView() {
      return h("div", { class: "staff-login" }, [
        h("section", { class: "staff-login-story" }, [
          h("div", { class: "brand" }, [
            h("span", { class: "brand-mark" }, growth.store.value.name[0]),
            h("strong", growth.store.value.name),
            languageSelect(),
            themeToggle(),
          ]),
          h("span", { class: "eyebrow" }, "BEHIND EVERY GOOD FIND"),
          h("h1", "A little care.\nA better shop."),
          h(
            "p",
            "Your products, orders and inventory. One calm place to keep everything moving.",
          ),
          h("div", {
            class: "login-illustration",
            innerHTML: artSvg({ name: "backpack", description: "" }),
          }),
        ]),
        h("section", { class: "staff-login-form" }, [
          h("span", { class: "eyebrow" }, "STAFF WORKSPACE"),
          h("h2", "Welcome to your workspace."),
          h("p", { class: "muted" }, "Sign in to take care of your shop."),
          h("form", { onSubmit: signIn }, [
            h("label", { class: "field" }, [
              h("span", "Email address"),
              h("input", {
                type: "email",
                required: true,
                autocomplete: "username",
                value: login.username,
                onInput: (e: Event) =>
                  (login.username = (
                    e.target as HTMLInputElement
                  ).value.trim()),
              }),
            ]),
            h("label", { class: "field" }, [
              h("span", "Password"),
              h("input", {
                type: "password",
                required: true,
                autocomplete: "current-password",
                value: login.password,
                onInput: (e: Event) =>
                  (login.password = (e.target as HTMLInputElement).value),
              }),
            ]),
            error.value
              ? h("p", { class: "form-error", role: "alert" }, error.value)
              : null,
            h(
              "button",
              {
                class: "btn primary full",
                type: "submit",
                disabled: busy.value,
              },
              busy.value ? "Signing in…" : "Enter workspace",
            ),
          ]),
          h(
            "p",
            { class: "fine-print" },
            "Local account: admin@example.test / Training2-local!",
          ),
        ]),
      ]);
    }
    const titles = {
      prices: [
        "A clear view of every price.",
        "Compare regular and selling prices over time, including scheduled offers.",
      ],
      variants: [
        "One product. More choices.",
        "Manage option SKUs with independent prices and stock.",
      ],
      support:["Help customers with confidence.","Manage requests and keep every conversation in one place."],
      targets:["Give your sales a direction.","Track weekly and monthly goals against live order revenue."],
      recovery:["Bring unfinished baskets back.","Saved carts help signed-in customers continue shopping."],
      settings:["Make the store your own.","Manage public store details and loyalty rules."],
      staff:["The right access for every role.","Control staff permissions and review administration history."],
      returns: [
        "Returns handled with care.",
        "Review requests, inspect received goods and record refunds.",
      ],
      overview: [
        "Your shop, at a glance.",
        "A clear view of what’s moving and what needs your attention.",
      ],
      inventory: [
        "Good products. Well stocked.",
        "Manage your catalog and make stock adjustments in one place.",
      ],
      orders: [
        "Every order, in one place.",
        "Track confirmed orders and customer activity.",
      ],
      activity: [
        "Every unit has a story.",
        "A history of purchases, cancellations and inventory adjustments.",
      ],
    };
    return () =>
      !token.value
        ? loginView()
        : h("div", { class: "staff-app" }, [
            h("aside", { class: "sidebar" }, [
              h("div", { class: "brand" }, [
                h("span", { class: "brand-mark" }, "S"),
                h("strong", growth.store.value.name),
                languageSelect(),
                themeToggle(),
              ]),
              h("span", { class: "sidebar-caption" }, "STAFF WORKSPACE"),
              h(
                "nav",
                (
                  [
                    ["overview", "grid", "Overview"],
                    ["inventory", "box", "Inventory"],
                    ["orders", "cart", "Orders"],
                    ["activity", "chart", "Stock activity"],
                    ["prices", "chart", "Price history"],
                    ["variants", "box", "Product variants"],
                    ["returns", "refresh", "Returns & refunds"],
                    ["support", "user", "Customer support"],
                    ["targets", "chart", "Sales targets"],
                    ["recovery", "cart", "Cart recovery"],
                    ["settings", "grid", "Store settings"],
                    ["staff", "shield", "Staff roles"],
                  ] as const
                ).filter(([key])=>growth.pageAllowed(key)).map(([key, i, label]) =>
                  h(
                    "button",
                    {
                      class: page.value === key ? "selected" : "",
                      onClick: () => changePage(key),
                    },
                    [
                      icon(i),
                      label,
                      key === "inventory"
                        ? h("span", String(stats.value.products))
                        : null,
                    ],
                  ),
                ),
              ),
              h("div", { class: "sidebar-bottom" }, [
                h("div", { class: "sidebar-help" }, [
                  icon("shield"),
                  h("strong", "Everything in sync"),
                  h(
                    "p",
                    "Stock refreshes automatically across your shop and workspace.",
                  ),
                ]),
                btn(
                  "Open customer shop",
                  () => {
                    const url = new URL(location.href);
                    url.port = "5173";
                    url.pathname = "/";
                    url.hash = "";
                    url.search = `?lang=${language.value}`;
                    window.open(url.href, "_blank", "noopener");
                  },
                  "text",
                  false,
                  "arrow",
                ),
                btn("Sign out", signOut, "text", false, "logout"),
              ]),
            ]),
            h("div", { class: "workspace" }, [
              h("header", { class: "workspace-header" }, [
                h("div", [
                  h("span", { class: "muted" }, "Workspace"),
                  h("span", " / "),
                  h(
                    "strong",
                    page.value === "activity"
                      ? "Stock activity"
                      : page.value[0].toUpperCase() + page.value.slice(1),
                  ),
                ]),
                h("div", { class: "workspace-status" }, [
                  h(
                    "span",
                    {
                      class: `live-indicator ${online.value ? "" : "offline"}`,
                      title: `Last updated: ${lastSync.value}`,
                    },
                    [
                      h("i"),
                      online.value ? "Updates every 4s" : "Updates paused",
                    ],
                  ),
                  h("span", { class: "avatar" }, "AD"),
                  h(
                    "button",
                    {
                      class: "icon-button mobile-signout",
                      "aria-label": "Sign out",
                      onClick: signOut,
                    },
                    icon("logout"),
                  ),
                ]),
              ]),
              h("main", { class: "workspace-main" }, [
                h("div", { class: "workspace-title" }, [
                  h("div", [
                    h(
                      "span",
                      { class: "eyebrow" },
                      "MAKE EVERY DAY A LITTLE BETTER",
                    ),
                    h("h1", titles[page.value][0]),
                    h("p", { class: "muted" }, titles[page.value][1]),
                  ]),
                  h("div", { class: "title-actions" }, [
                    btn(
                      loading.value ? "Refreshing…" : "Refresh",
                      () => void refresh(),
                      "secondary",
                      loading.value,
                      "refresh",
                    ),
                    ["overview", "inventory", "variants"].includes(page.value)
                      ? btn(
                          "Add product",
                          () => open("product"),
                          "primary",
                          busy.value,
                          "plus",
                        )
                      : null,
                  ]),
                ]),
                error.value && !modal.value
                  ? h("div", { class: "error-banner", role: "alert" }, [
                      h("span", error.value),
                      btn("Dismiss", () => (error.value = ""), "text"),
                    ])
                  : null,
                ...(["support","targets","recovery","settings","staff"].includes(page.value) ? growth.render(page.value) : page.value === "prices"
                  ? shopping.pricesPage()
                  : page.value === "variants"
                    ? shopping.variantsPage()
                    : page.value === "returns"
                      ? shopping.returnsPage()
                      : page.value === "overview"
                        ? dashboard()
                        : page.value === "inventory"
                          ? inventory()
                          : page.value === "orders"
                            ? [
                                metrics(),
                                h("section", { class: "card" }, [
                                  h("div", { class: "card-heading padded" }, [
                                    h("h2", "Customer orders"),
                                    h(
                                      "span",
                                      { class: "muted" },
                                      `${orderTotal.value} orders`,
                                    ),
                                  ]),
                                  ordersTable(),
                                  h("div", { class: "pager" }, [
                                    btn(
                                      "Previous",
                                      () => {
                                        orderPage.value--;
                                        void refresh();
                                      },
                                      "secondary",
                                      orderPage.value <= 1,
                                    ),
                                    h(
                                      "span",
                                      `Page ${orderPage.value} of ${Math.max(1, Math.ceil(orderTotal.value / 10))}`,
                                    ),
                                    btn(
                                      "Next",
                                      () => {
                                        orderPage.value++;
                                        void refresh();
                                      },
                                      "secondary",
                                      orderPage.value * 10 >= orderTotal.value,
                                    ),
                                  ]),
                                ]),
                              ]
                            : [
                                chartView(),
                                h("section", { class: "card padded" }, [
                                  h("div", { class: "card-heading" }, [
                                    h("h2", "Inventory timeline"),
                                    h(
                                      "span",
                                      { class: "muted" },
                                      "Latest 60 changes",
                                    ),
                                  ]),
                                  activityList(),
                                ]),
                              ]),
                h("footer", { class: "workspace-footer" }, [
                  h("span", `${growth.store.value.name} staff workspace`),
                  h(
                    "span",
                    lastSync.value
                      ? `Last synced ${lastSync.value}`
                      : "Connecting…",
                  ),
                ]),
              ]),
            ]),
            notice.value
              ? h("div", { class: "toast", role: "status" }, [
                  icon("check"),
                  notice.value,
                ])
              : null,
            dialog(),
          ]);
  },
}).mount("#app");
