import { useCustomerGrowth } from "./store-growth.ts";
import {
  SUBCATEGORIES,
  productSubcategory,
} from "../../../packages/ui/src/product-subcategories.ts";
import "./catalog-navigation.css";
import "./catalog-filters.css";
import { useCustomerLogin } from "./customer-login.ts";
import { useReferenceTracking } from "./reference-tracking.ts";
import { trackingReference } from "../../../packages/api-contracts/src/tracking-reference.ts";
import type { VNode } from "vue";
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
import { couponQuote } from "../../../packages/api-contracts/src/coupons.ts";
import { offerCountdown } from "../../../packages/api-contracts/src/offer-countdown.ts";
import { cleanProductDescription } from "../../../packages/api-contracts/src/product-details.ts";
import {
  activeProductDetails as productDetails,
  saleWindow,
} from "../../../packages/api-contracts/src/scheduled-price.ts";
import {
  h,
  language,
  languageSelect,
  locale,
} from "../../../packages/ui/src/language.ts";
import { trackingLabel } from "../../../packages/ui/src/order-tracking.ts";
import type {
  CartItem,
  Order,
  Product,
  Receipt,
  Recipient,
} from "../../../packages/ui/src/storefront.ts";
import {
  adminToken,
  artSvg,
  categories,
  category,
  date,
  iconSvg,
  money,
  readCart,
} from "../../../packages/ui/src/storefront.ts";
import { themeToggle } from "../../../packages/ui/src/theme.ts";
import { orderTrackingPage } from "./order-tracking.ts";
import { launchPayment } from "./payment-checkout.ts";
import { downloadReceipt } from "./receipt.ts";
import { ShopHero } from "./shop-hero.ts";
import { useShoppingTools } from "./shopping-tools.ts";
import "./style.css";
import "./offer-countdown.css";
import "../../../packages/ui/src/theme.css";

const icon = (name: string) =>
  h("span", { class: "icon", innerHTML: iconSvg(name) });
const button = (
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
const productDescription = cleanProductDescription;
const art = (product: Product, large = false) =>
  h("div", { class: "product-art", innerHTML: artSvg(product, large) });
const badge = (status: string) =>
  h("span", { class: `badge ${status}` }, status);

createApp({
  setup() {
    type Page =
      | "shop"
      | "cart"
      | "checkout"
      | "orders"
      | "success"
      | "track-reference"
      | "tracking"
      | "addresses"
      | "returns"
      | "compare" | "loyalty" | "support";
    const token = ref(sessionStorage.getItem("training2.customer") ?? "");
    const customer = ref(
      sessionStorage.getItem("training2.customerName") ?? "Customer",
    );
    const catalog = ref<Product[]>([]),
      orders = ref<Order[]>([]),
      orderTotal = ref(0),
      orderPage = ref(1);
    const cart = ref<CartItem[]>(readCart("training2.cart"));
    const page = ref<Page>("shop"),
      search = ref(""),
      department = ref("All products"),
      sort = ref("featured"),
      onlyStock = ref(false);
    const loading = ref(true),
      busy = ref(false),
      syncing = ref(false),
      online = ref(true),
      synced = ref("");
    const notice = ref(""),
      error = ref(""),
      loginOpen = ref(false),
      detail = ref<Product | null>(null),
      cancelTarget = ref<Order | null>(null);
    const lastOrder = ref<Order | null>(null),
      downloading = ref("");
    const trackedOrder = ref<Order | null>(null);
    const trackingId = ref("");
    const trackingLoading = ref(false);
    let trackingRequest: Promise<void> | null = null;
    const credentials = reactive({
      username: "buyer@example.test",
      password: "Training2-local!",
    });
    const paymentMethod = ref<
        "cod" | "razorpay" | "paypay" | "demo_card" | "demo_qr"
      >("cod"),
      paymentCurrency = ref<"JPY" | "INR">("JPY");
    const paymentSettings = ref<{
      demo?: boolean;
      demoFx?: { rate: number; date: string; source: string } | null;
      razorpay: boolean;
      paypay: boolean;
      fx: { rate: number; date: string; source: string } | null;
    }>({ razorpay: false, paypay: false, fx: null });
    const delivery = reactive<Recipient>({
      name: "",
      address: "",
      city: "",
      postalCode: "",
    });
    const clockNow = ref(Date.now());
    let clockTimer: ReturnType<typeof setInterval> | undefined;
    function offerTimer(product: Product) {
      const timer = offerCountdown(product, clockNow.value);
      if (!timer) return null;
      return h(
        "div",
        {
          class: `offer-countdown ${timer.status}`,
          title:
            (timer.status === "scheduled" ? "Starts at " : "Ends at ") +
            date(timer.targetAt),
        },
        [
          h("span", timer.label),
          timer.status !== "ended" ? h("strong", timer.remaining) : null,
          h("small", date(timer.targetAt)),
        ],
      );
    }
    let checkoutKey = crypto.randomUUID(),
      checkoutFingerprint = "";
    let poll: ReturnType<typeof setInterval> | undefined,
      toastTimer: ReturnType<typeof setTimeout> | undefined;
    let catalogPromise: Promise<void> | null = null,
      ordersPromise: Promise<void> | null = null;
    let previousFocus: HTMLElement | null = null;
    const modalOpen = computed(
      () => loginOpen.value || !!detail.value || !!cancelTarget.value,
    );
    watch(modalOpen, async (open) => {
      if (open) {
        previousFocus = document.activeElement as HTMLElement;
        await nextTick();
        document
          .querySelector<HTMLElement>(".dialog input,.dialog button")
          ?.focus();
      } else previousFocus?.focus();
    });
    const selectedOption = ref("");
    watch(
      () => detail.value?.id,
      () => {
        const product = detail.value;
        selectedOption.value = product
          ? product.stock > 0
            ? product.id
            : (product.variants?.find((v) => v.stock > 0)?.id ?? product.id)
          : "";
      },
    );
    const selectedDetail = computed(
      () =>
        catalog.value.find((product) => product.id === selectedOption.value) ??
        detail.value,
    );
    const familyStock = (product: Product) =>
      product.stock +
      (product.variants ?? []).reduce((sum, option) => sum + option.stock, 0);
    const referenceTracking = useReferenceTracking(
      request,
      () => token.value,
      openLogin,
      openTracking,
    );
    const growth = useCustomerGrowth(request,token,cart,catalog,notify,openLogin);
    const accountLogin = useCustomerLogin(acceptCustomerSession);
    watch(loginOpen, (open) => {
      if (open) void accountLogin.load();
    });
    const shopping = useShoppingTools(
      request,
      catalog,
      () => token.value,
      notify,
      (product) => {
        if (product.variants?.length) detail.value = product;
        else add(product);
      },
      (target) => navigate(target),
    );
    function notify(message: string) {
      notice.value = message;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (notice.value = ""), 5000);
    }
    function navigate(target: Page) {
      page.value = target;
      window.location.hash = target;
      error.value = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (target === "orders" && token.value) void loadOrders();
      if (target === "support") void growth.loadSupport();
      if (target === "loyalty" || target === "checkout") void growth.loadLoyalty();
      if (target === "addresses") void shopping.loadAddresses();
      if (target === "returns") void shopping.loadReturns();
      if (target === "checkout") void shopping.prepareCheckout(delivery);
    }
    function remember() {
      sessionStorage.setItem("training2.cart", JSON.stringify(cart.value));
    }
    async function acceptCustomerSession(session: {
      token: string;
      name: string;
      guest: boolean;
    }) {
      token.value = session.token;
      customer.value = session.name;
      sessionStorage.setItem("training2.customer", session.token);
      sessionStorage.setItem("training2.customerName", session.name);
      loginOpen.value = false;
      notify(
        session.guest
          ? "You are browsing as a guest."
          : "Welcome back. You are ready to shop.",
      );
      await loadOrders();
      if (page.value === "cart") navigate("checkout");
      if (page.value === "tracking") void loadTrackedOrder();
      if (page.value === "addresses") void shopping.loadAddresses();
      if (page.value === "returns") void shopping.loadReturns();
    }
    function logout(expired = false) {
      const previousToken = token.value;
      if (previousToken.startsWith("ss_"))
        void fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: "Bearer " + previousToken },
        }).catch(() => {});
      token.value = "";
      sessionStorage.removeItem("training2.customer");
      sessionStorage.removeItem("training2.customerName");
      appliedCoupon.value = "";
      couponInput.value = "";
      couponError.value = "";
      couponCelebration.value = null;
      cart.value = [];
      remember();
      orders.value = [];
      lastOrder.value = null;
      Object.assign(delivery, {
        name: "",
        address: "",
        city: "",
        postalCode: "",
      });
      if (page.value !== "shop") navigate("shop");
      if (expired)
        error.value = "Your session expired. Sign in again to continue.";
      else notify("You are signed out.");
    }
    async function request(path: string, options: RequestInit = {}) {
      const headers = new Headers(options.headers);
      headers.set("Content-Type", "application/json");
      if (token.value) headers.set("Authorization", `Bearer ${token.value}`);
      let response: Response;
      try {
        response = await fetch(`/api${path}`, { ...options, headers, signal:options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
      } catch {
        throw new Error(
          "Unable to reach the shop. Check your connection and try again.",
        );
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401 && token.value) logout(true);
        throw new Error(
          body?.message ??
            "The request could not be completed. Please try again.",
        );
      }
      return body;
    }
    let catalogEtag = "";
    function loadTrackedOrder(): Promise<void> {
      if (!token.value || !trackingId.value) return Promise.resolve();
      if (trackingRequest) return trackingRequest;
      const id = trackingId.value;
      trackingLoading.value = true;
      trackingRequest = (async () => {
        try {
          const order: Order = await request(`/orders/${id}/tracking`);
          if (trackingId.value === id) trackedOrder.value = order;
        } catch (failure) {
          if (trackingId.value === id) error.value = (failure as Error).message;
        } finally {
          trackingLoading.value = false;
          trackingRequest = null;
        }
      })();
      return trackingRequest;
    }
    function openTracking(order: Order) {
      trackedOrder.value = order;
      trackingId.value = order.id;
      page.value = "tracking";
      error.value = "";
      window.location.hash = `tracking/${order.id}`;
      window.scrollTo({ top: 0, behavior: "smooth" });
      void loadTrackedOrder();
    }
    function loadCatalog(): Promise<void> {
      if (catalogPromise) return catalogPromise;
      catalogPromise = (async () => {
        syncing.value = true;
        try {
          const response = await fetch("/api/catalog", {
            headers: catalogEtag ? { "If-None-Match": catalogEtag } : {},
          });
          if (response.status !== 304) {
            if (!response.ok)
              throw new Error("Unable to load the catalog. Please retry.");
            const data = await response.json();
            let items: Product[] = data.items;
            for (let p = 51; p <= Math.ceil(data.total / 100); p++) {
              const next = await request(`/products?page=${p}&pageSize=100`);
              items = items.concat(next.items);
            }
            catalog.value = items;
            if (detail.value)
              detail.value =
                items.find((product) => product.id === detail.value?.id) ??
                null;
            catalogEtag =
              data.total > 5000 ? "" : (response.headers.get("ETag") ?? "");
          }
          online.value = true;
          synced.value = new Date().toLocaleTimeString(locale(), {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
        } catch (failure) {
          online.value = false;
          if (!catalog.value.length) error.value = (failure as Error).message;
        } finally {
          loading.value = false;
          syncing.value = false;
          catalogPromise = null;
        }
      })();
      return catalogPromise;
    }
    function loadOrders(): Promise<void> {
      if (!token.value) return Promise.resolve();
      if (ordersPromise) return ordersPromise;
      ordersPromise = (async () => {
        try {
          const result = await request(
            `/orders?page=${orderPage.value}&pageSize=10`,
          );
          orders.value = result.items;
          orderTotal.value = result.total;
          void growth.loadLoyalty();
        } catch (failure) {
          error.value = (failure as Error).message;
        } finally {
          ordersPromise = null;
        }
      })();
      return ordersPromise;
    }
    const minimumPrice = ref("");
    const maximumPrice = ref("");
    const offersOnly = ref(false);
    const catalogPage = ref(1);
    const subcategory = ref("");
    watch(department, () => {
      subcategory.value = "";
    });
    watch(
      [
        search,
        department,
        sort,
        onlyStock,
        minimumPrice,
        maximumPrice,
        offersOnly,
        subcategory,
      ],
      () => {
        catalogPage.value = 1;
      },
    );
    const filteredCatalog = computed(() => {
      const query = search.value.toLowerCase().trim();
      const result = catalog.value.filter(
        (p) =>
          (department.value === "All products" ||
            category(p) === department.value) &&
          !p.variantParentId &&
          (!onlyStock.value || familyStock(p) > 0) &&
          (!minimumPrice.value || p.price >= Number(minimumPrice.value)) &&
          (!maximumPrice.value || p.price <= Number(maximumPrice.value)) &&
          (!offersOnly.value || productDetails(p).discountPercent > 0) &&
          (!query ||
            `${p.name} ${p.code} ${p.description}`
              .toLowerCase()
              .includes(query)),
      );
      if (sort.value === "low") result.sort((a, b) => a.price - b.price);
      if (sort.value === "high") result.sort((a, b) => b.price - a.price);
      if (sort.value === "newest")
        result.sort(
          (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
        );
      if (sort.value === "discount")
        result.sort(
          (a, b) =>
            productDetails(b).discountPercent -
            productDetails(a).discountPercent,
        );
      if (sort.value === "name")
        result.sort((a, b) => a.name.localeCompare(b.name));
      return result;
    });
    const displayed = computed(() =>
      filteredCatalog.value.filter(
        (p) =>
          !subcategory.value ||
          productSubcategory(p, category(p)) === subcategory.value,
      ),
    );
    const subcategoryOptions = computed(() => {
      const counts = new Map<string, number>();
      for (const product of filteredCatalog.value) {
        const key = productSubcategory(product, category(product));
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [
        ...new Set([
          ...(SUBCATEGORIES[department.value] ?? []),
          ...counts.keys(),
        ]),
      ].map((label) => ({ label, count: counts.get(label) ?? 0 }));
    });
    function clearCatalogFilters() {
      subcategory.value = "";
      search.value = "";
      department.value = "All products";
      sort.value = "featured";
      onlyStock.value = false;
      offersOnly.value = false;
      minimumPrice.value = "";
      maximumPrice.value = "";
    }
    async function goCatalogPage(value: number, scroll = false) {
      catalogPage.value = Math.max(1, Math.min(value, catalogPages.value));
      if (scroll) {
        await nextTick();
        document
          .getElementById("collection")
          ?.scrollIntoView({
            block: "start",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "auto"
              : "smooth",
          });
      }
    }
    function productPagination(bottom = false) {
      const current = Math.min(catalogPage.value, catalogPages.value),
        total = catalogPages.value;
      const pages = [
        ...new Set([
          1,
          ...Array.from(
            { length: Math.min(5, total) },
            (_, i) => Math.max(1, Math.min(current - 2, total - 4)) + i,
          ),
          total,
        ]),
      ]
        .filter((p) => p >= 1 && p <= total)
        .sort((a, b) => a - b);
      return h(
        "nav",
        {
          class: `catalog-page-navigation ${bottom ? "bottom" : ""}`,
          "aria-label": bottom ? "Bottom product pages" : "Top product pages",
        },
        [
          h(
            "span",
            { class: "catalog-page-summary", "aria-live": "polite" },
            `Page ${current} of ${total} · ${displayed.value.length} products`,
          ),
          button(
            "Previous",
            () => {
              void goCatalogPage(current - 1, bottom);
            },
            "secondary",
            current <= 1 || loading.value,
          ),
          bottom
            ? h(
                "div",
                { class: "catalog-page-numbers" },
                pages.flatMap((page, index) => [
                  index && page - pages[index - 1] > 1
                    ? h("span", { "aria-hidden": "true" }, "…")
                    : null,
                  h(
                    "button",
                    {
                      type: "button",
                      class: "page-number",
                      "aria-label": `Go to page ${page}`,
                      "aria-current": page === current ? "page" : undefined,
                      disabled: loading.value,
                      onClick: () => {
                        void goCatalogPage(page, true);
                      },
                    },
                    String(page),
                  ),
                ]),
              )
            : null,
          button(
            "Next",
            () => {
              void goCatalogPage(current + 1, bottom);
            },
            "secondary",
            current >= total || loading.value,
          ),
        ],
      );
    }
    const catalogPages = computed(() =>
      Math.max(1, Math.ceil(displayed.value.length / 24)),
    );
    const visibleProducts = computed(() =>
      displayed.value.slice(
        (Math.min(catalogPage.value, catalogPages.value) - 1) * 24,
        Math.min(catalogPage.value, catalogPages.value) * 24,
      ),
    );
    const lines = computed(() =>
      cart.value.map((item) => ({
        item,
        product: catalog.value.find((p) => p.id === item.productId),
      })),
    );
    const count = computed(() =>
      cart.value.reduce((s, i) => s + i.quantity, 0),
    );
    const subtotal = computed(() =>
      lines.value.reduce(
        (s, { item, product }) => s + (product?.price ?? 0) * item.quantity,
        0,
      ),
    );
    const couponInput = ref("");
    const appliedCoupon = ref("");
    const couponError = ref("");
    const couponCelebration = ref<{ code: string; saved: number } | null>(null);
    let couponTimer: ReturnType<typeof setTimeout> | undefined;
    const coupon = computed(() =>
      couponQuote(subtotal.value, appliedCoupon.value),
    );
    const discount = computed(() =>
      coupon.value.error ? 0 : coupon.value.discount,
    );
    const rewardDiscount = computed(()=>growth.discount(subtotal.value-discount.value));
    const tax = computed(() =>
      Math.floor((subtotal.value - discount.value - rewardDiscount.value) * 0.1),
    );
    const total = computed(() => subtotal.value - discount.value - rewardDiscount.value + tax.value);
    function applyCoupon() {
      if (busy.value) return;
      const quote = couponQuote(subtotal.value, couponInput.value);
      couponError.value =
        quote.error || (!quote.code ? "Enter a coupon code." : "");
      if (couponError.value) return;
      appliedCoupon.value = quote.code;
      couponInput.value = quote.code;
      couponCelebration.value = { code: quote.code, saved: quote.discount };
      clearTimeout(couponTimer);
      couponTimer = setTimeout(() => (couponCelebration.value = null), 12000);
    }
    watch(subtotal, () => {
      if (appliedCoupon.value && coupon.value.error) {
        appliedCoupon.value = "";
        couponError.value =
          "Coupon removed: the product subtotal must be above ¥20,000.";
        couponCelebration.value = null;
      }
    });
    const cartValid = computed(
      () =>
        cart.value.length > 0 &&
        lines.value.every(
          ({ item, product }) =>
            product && product.stock >= item.quantity && item.quantity <= 1000,
        ),
    );
    function add(product: Product, quantity = 1) {
      const existing = cart.value.find((i) => i.productId === product.id);
      if (
        (existing?.quantity ?? 0) + quantity >
        Math.min(product.stock, 1000)
      ) {
        notify("You have reached the available quantity.");
        return;
      }
      if (existing) existing.quantity += quantity;
      else cart.value.push({ productId: product.id, quantity });
      remember();
      notify(`${product.name} added to your cart.`);
    }
    function quantity(id: string, value: number) {
      if (value <= 0) cart.value = cart.value.filter((i) => i.productId !== id);
      else {
        const item = cart.value.find((i) => i.productId === id);
        if (item) item.quantity = value;
      }
      remember();
    }
    function beginCheckout() {
      if (!cartValid.value) return;
      if (!token.value) {
        openLogin();
        return;
      }
      navigate("checkout");
    }
    function openLogin() {
      previousFocus = document.activeElement as HTMLElement;
      loginOpen.value = true;
      error.value = "";
      void nextTick(() =>
        document.querySelector<HTMLInputElement>(".dialog input")?.focus(),
      );
    }
    function closeModal() {
      if (busy.value) return;
      loginOpen.value = false;
      detail.value = null;
      cancelTarget.value = null;
      previousFocus?.focus();
    }
    async function signIn(event: Event) {
      event.preventDefault();
      if (busy.value) return;
      busy.value = true;
      error.value = "";
      try {
        const response = await fetch("/staff-api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            body?.message ?? "The sign-in server is unavailable.",
          );
        if (typeof body?.token !== "string")
          throw new Error("Sign-in did not return a token.");
        if (adminToken(body.token) || (body.role && body.role !== "disabled")) {
          const url = new URL(window.location.href);
          url.port = "5174";
          url.pathname = "/";
          url.search = `?lang=${language.value}`;
          url.hash = `training2-token=${encodeURIComponent(body.token)}`;
          window.location.assign(url.href);
          return;
        }
        token.value = body.token;
        customer.value = credentials.username.split("@")[0];
        sessionStorage.setItem("training2.customer", body.token);
        sessionStorage.setItem("training2.customerName", customer.value);
        credentials.password = "";
        loginOpen.value = false;
        notify("Welcome back. You are ready to shop.");
        await loadOrders();
        if (page.value === "cart") navigate("checkout");
        if (page.value === "tracking") void loadTrackedOrder();
        if (page.value === "addresses") void shopping.loadAddresses();
        if (page.value === "returns") void shopping.loadReturns();
      } catch (failure) {
        error.value = (failure as Error).message;
      } finally {
        busy.value = false;
      }
    }
    async function placeOrder(event: Event) {
      event.preventDefault();
      if (busy.value || !cartValid.value) return;
      busy.value = true;
      error.value = "";
      try {
        const payload = {
          items: cart.value.map((i) => ({ ...i })),
          recipient: { ...delivery },
          expectedTotal: total.value,
          couponCode: appliedCoupon.value || undefined,
          loyaltyPoints:growth.pointsToUse(subtotal.value-discount.value),
          paymentMethod: paymentMethod.value,
          currency: paymentCurrency.value,
          expectedPaymentAmountMinor: paymentAmount.value,
        };
        const fingerprint = JSON.stringify(payload);
        if (checkoutFingerprint !== fingerprint) {
          checkoutKey = crypto.randomUUID();
          checkoutFingerprint = fingerprint;
        }
        const order: Order = await request("/checkout", {
          method: "POST",
          headers: { "Idempotency-Key": checkoutKey },
          body: JSON.stringify(payload),
        });
        if (order.gateway) {
          sessionStorage.setItem("training2.pending-payment", order.id);
          cart.value = [];
          remember();
          checkoutKey = crypto.randomUUID();
          checkoutFingerprint = "";
          navigate("orders");
          await Promise.all([loadCatalog(), loadOrders()]);
          const verified = await launchPayment(order, (result) =>
            request(
              "/payments/" +
                order.id +
                (order.gateway?.mode === "demo" ? "/demo-complete" : "/verify"),
              {
                method: "POST",
                body: JSON.stringify(result),
              },
            ),
          );
          if (verified?.status === "confirmed") await finishOrder(verified);
          else if (verified)
            notify("Payment is processing. Use Check payment in Your orders.");
          return;
        }
        await finishOrder(order);
        return;
      } catch (failure) {
        error.value = (failure as Error).message;
        await loadCatalog();
        await request("/payments/config")
          .then((settings) => (paymentSettings.value = settings))
          .catch(() => {});
      } finally {
        busy.value = false;
      }
    }
    async function finishOrder(order: Order) {
      lastOrder.value = order;
      cart.value = [];
      remember();
      sessionStorage.removeItem("training2.pending-payment");
      checkoutKey = crypto.randomUUID();
      checkoutFingerprint = "";
      navigate("success");
      notify(
        order.receipt?.payment?.state === "due"
          ? "Order placed. Payment is due on delivery."
          : order.receipt?.payment?.provider.startsWith("demo_")
            ? "Demo completed. No money charged; receipt ready."
            : "Payment verified. Your receipt is ready.",
      );
      await Promise.all([loadCatalog(), loadOrders()]);
    }
    async function refreshPayment(order: Order) {
      if (busy.value) return;
      busy.value = true;
      error.value = "";
      try {
        const updated: Order = await request(`/payments/${order.id}/status`, {
          method: "POST",
        });
        if (
          updated.status === "confirmed" &&
          updated.receipt?.payment?.state === "paid"
        )
          await finishOrder(updated);
        else {
          notify(
            updated.receipt?.payment?.state === "refunded"
              ? "Refund confirmed and stock restored."
              : "Payment status: " +
                  (updated.receipt?.payment?.state ?? updated.status),
          );
          await Promise.all([loadCatalog(), loadOrders()]);
        }
      } catch (failure) {
        error.value = (failure as Error).message;
      } finally {
        busy.value = false;
      }
    }
    async function resumeSavedPayment(order: Order) {
      if (busy.value) return;
      busy.value = true;
      error.value = "";
      try {
        const current: Order = await request(`/payments/${order.id}/resume`, {
          method: "POST",
        });
        const verified = await launchPayment(current, (result) =>
          request(
            "/payments/" +
              order.id +
              (current.gateway?.mode === "demo" ? "/demo-complete" : "/verify"),
            {
              method: "POST",
              body: JSON.stringify(result),
            },
          ),
        );
        if (verified?.status === "confirmed") await finishOrder(verified);
        else await loadOrders();
      } catch (failure) {
        error.value = (failure as Error).message;
      } finally {
        busy.value = false;
      }
    }
    async function cancelOrder() {
      if (!cancelTarget.value || busy.value) return;
      busy.value = true;
      error.value = "";
      try {
        const selected = cancelTarget.value;
        const onlinePayment =
          selected.receipt?.payment &&
          selected.receipt.payment.provider !== "cod";
        const updated: Order = await request(
          onlinePayment
            ? `/payments/${selected.id}/cancel`
            : `/orders/${selected.id}/cancel`,
          {
            method: "POST",
          },
        );
        cancelTarget.value = null;
        notify(
          updated.receipt?.payment?.state === "refund_pending"
            ? "Refund requested. Stock will return after the provider confirms it."
            : "Order cancelled. Stock has been returned.",
        );
        await Promise.all([loadCatalog(), loadOrders()]);
      } catch (failure) {
        error.value = (failure as Error).message;
      } finally {
        busy.value = false;
      }
    }
    async function confirmPending(order: Order) {
      if (busy.value) return;
      busy.value = true;
      error.value = "";
      try {
        const result = await request(`/orders/${order.id}/confirm`, {
          method: "POST",
        });
        lastOrder.value = result;
        navigate("success");
        await Promise.all([loadCatalog(), loadOrders()]);
      } catch (failure) {
        error.value = (failure as Error).message;
      } finally {
        busy.value = false;
      }
    }
    async function pdf(order: Order) {
      if (downloading.value) return;
      downloading.value = order.id;
      try {
        const saved: Receipt = await request(`/orders/${order.id}/receipt`);
        await downloadReceipt(saved);
        notify("Your PDF receipt has been downloaded.");
      } catch (failure) {
        error.value = (failure as Error).message;
      } finally {
        downloading.value = "";
      }
    }
    function keyboard(event: KeyboardEvent) {
      if (!modalOpen.value) return;
      if (event.key === "Escape") closeModal();
      if (event.key === "Tab") {
        const elements = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".dialog button:not(:disabled), .dialog input, .dialog a[href]",
          ),
        );
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    let paymentConfigReady = false,
      paymentConfigBusy = false;
    async function loadPaymentSettings() {
      if (paymentConfigBusy) return;
      paymentConfigBusy = true;
      try {
        paymentSettings.value = await request("/payments/config");
        paymentConfigReady = true;
      } catch {
        paymentConfigReady = false;
      } finally {
        paymentConfigBusy = false;
      }
    }
    function resume() {
      if (document.visibilityState === "visible") {
        if (!paymentConfigReady) void loadPaymentSettings();
        if (page.value === "tracking") void loadTrackedOrder();
        if (page.value === "track-reference") void referenceTracking.refresh();
        void loadCatalog();
        void growth.loadSettings();
        if(page.value === "support") void growth.loadSupport();
        if(page.value === "loyalty" || page.value === "checkout") void growth.loadLoyalty();
        if (
          token.value &&
          (page.value === "orders" || page.value === "success")
        )
          void loadOrders();
      }
    }
    function hashChange() {
      const target = window.location.hash.slice(1);
      const trackingMatch = target.match(/^tracking\/([0-9a-f-]{36})$/i);
      if (trackingMatch) {
        if (trackingId.value !== trackingMatch[1]) trackedOrder.value = null;
        trackingId.value = trackingMatch[1];
        page.value = "tracking";
        void loadTrackedOrder();
        return;
      }
      if (
        [
          "shop",
          "cart",
          "checkout",
          "orders",
          "addresses",
          "returns",
          "compare",
          "track-reference", "loyalty", "support",
        ].includes(target)
      ) {
        page.value = target as Page;
        if (target === "support") void growth.loadSupport();
        if (target === "loyalty") void growth.loadLoyalty();
        if (target === "addresses") void shopping.loadAddresses();
        if (target === "returns") void shopping.loadReturns();
        if (target === "checkout") void shopping.prepareCheckout(delivery);
      }
    }
    onMounted(() => {
      void growth.loadSettings();
      clockTimer = setInterval(() => {
        const previous = clockNow.value;
        clockNow.value = Date.now();
        if (
          catalog.value.some((product) => {
            const window = saleWindow(product);
            return (
              window &&
              [Date.parse(window.startsAt), Date.parse(window.endsAt)].some(
                (time) => time > previous && time <= clockNow.value,
              )
            );
          })
        )
          void loadCatalog();
      }, 1000);
      void loadPaymentSettings();
      const returnedOrder = new URLSearchParams(location.search).get(
        "payment_order",
      );
      if (returnedOrder) {
        history.replaceState(null, "", `${location.pathname}#orders`);
        page.value = "orders";
        sessionStorage.setItem("training2.pending-payment", returnedOrder);
      }

      hashChange();
      void loadCatalog();
      if (token.value) void loadOrders();
      poll = setInterval(resume, 4000);
      window.addEventListener("focus", resume);
      document.addEventListener("visibilitychange", resume);
      window.addEventListener("hashchange", hashChange);
      document.addEventListener("keydown", keyboard);
    });
    onBeforeUnmount(() => {
      clearInterval(poll);
      clearInterval(clockTimer);
      clearTimeout(toastTimer);
      clearTimeout(couponTimer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("hashchange", hashChange);
      document.removeEventListener("keydown", keyboard);
    });
    const paymentAmount = computed(() =>
      Math.round(
        total.value *
          (paymentCurrency.value === "INR"
            ? ((paymentMethod.value.startsWith("demo_")
                ? paymentSettings.value.demoFx?.rate
                : paymentSettings.value.fx?.rate) ?? 0) * 100
            : 1),
      ),
    );
    const paymentQuote = computed(() =>
      money(
        paymentAmount.value / (paymentCurrency.value === "INR" ? 100 : 1),
        paymentCurrency.value,
      ),
    );
    function paymentChoices() {
      return h("section", { class: "card payment-choices" }, [
        h(
          "p",
          { class: "demo-notice" },
          "Demo payments use fictional details. No bank, card or wallet is charged.",
        ),
        h("h2", [
          h("span", { class: "step" }, "3"),
          "How would you like to pay?",
        ]),
        h("div", { class: "payment-methods" }, [
          ...(
            [
              {
                id: "demo_card",
                title: "Demo card payment",
                description:
                  "Fake card supplied · no money charged · no keys needed",
                enabled: !!paymentSettings.value.demo,
              },
              {
                id: "demo_qr",
                title: "Demo QR payment",
                description: "Simulated QR checkout · no money charged",
                enabled: !!paymentSettings.value.demo,
              },
              {
                id: "cod",
                title: "Cash on Delivery",
                description: "Pay the saved amount when your order arrives.",
                enabled: true,
              },
              {
                id: "razorpay",
                title: "Cards / UPI QR / netbanking",
                description: paymentSettings.value.razorpay
                  ? "Razorpay test checkout · INR"
                  : "Razorpay test keys need local configuration.",
                enabled:
                  paymentSettings.value.razorpay && !!paymentSettings.value.fx,
              },
              {
                id: "paypay",
                title: "PayPay QR",
                description: paymentSettings.value.paypay
                  ? "PayPay sandbox checkout · JPY"
                  : "PayPay sandbox merchant credentials required.",
                enabled: paymentSettings.value.paypay,
              },
            ] as const
          ).map((method) =>
            h(
              "button",
              {
                type: "button",
                class:
                  "payment-option " +
                  (paymentMethod.value === method.id ? "selected" : ""),
                disabled: !method.enabled,
                onClick: () => {
                  paymentMethod.value = method.id;
                  if (method.id === "cod" && !paymentSettings.value.fx)
                    paymentCurrency.value = "JPY";
                  if (method.id === "razorpay") paymentCurrency.value = "INR";
                  if (method.id === "paypay") paymentCurrency.value = "JPY";
                },
              },
              [
                h(
                  "span",
                  { class: "payment-radio" },
                  paymentMethod.value === method.id ? "●" : "○",
                ),
                h("span", [
                  h("strong", method.title),
                  h("small", method.description),
                ]),
              ],
            ),
          ),
        ]),
        h("label", { class: "field" }, [
          h("span", "Payment currency"),
          h(
            "select",
            {
              value: paymentCurrency.value,
              onChange: (e: Event) => {
                paymentCurrency.value = (e.target as HTMLSelectElement).value as
                  | "JPY"
                  | "INR";
                if (!paymentMethod.value.startsWith("demo_"))
                  paymentMethod.value = "cod";
              },
            },
            [
              h("option", { value: "JPY" }, "JPY — Japanese yen"),
              h(
                "option",
                {
                  value: "INR",
                  disabled:
                    !paymentSettings.value.fx &&
                    !(
                      paymentMethod.value.startsWith("demo_") &&
                      paymentSettings.value.demoFx
                    ),
                },
                "INR — Indian rupees",
              ),
            ],
          ),
        ]),
        h("div", { class: "payment-quote" }, [
          h(
            "span",
            paymentMethod.value === "cod"
              ? "Due on delivery"
              : "Amount at test checkout",
          ),
          h("strong", paymentQuote.value),
        ]),
        h(
          "p",
          { class: "fine-print" },
          paymentMethod.value.startsWith("demo_")
            ? "Fictional demo checkout. INR, when selected, uses a fixed demo rate of 0.55 INR per JPY."
            : paymentCurrency.value === "INR" && paymentSettings.value.fx
              ? "Converted from JPY using " +
                paymentSettings.value.fx.source +
                " (" +
                paymentSettings.value.fx.date +
                "). The amount is checked again before payment."
              : paymentMethod.value.startsWith("demo_")
                ? "Fictional demo checkout. INR, when selected, uses a fixed demo rate of 0.55 INR per JPY."
                : "Catalog prices are in JPY. Online providers are configured for test/sandbox payments.",
        ),
      ]);
    }
    function summary(checkout = false) {
      return h("aside", { class: "summary card" }, [
        h("h2", "Order summary"),
        h("div", { class: "coupon-box" }, [
          h("label", { for: "coupon-code" }, "Have a coupon?"),
          h("div", { class: "coupon-entry" }, [
            h("input", {
              id: "coupon-code",
              value: couponInput.value,
              placeholder: "Enter coupon code",
              autocomplete: "off",
              autocapitalize: "none",
              spellcheck: false,
              maxlength: 50,
              disabled: busy.value,
              onInput: (event: Event) => {
                couponInput.value = (event.target as HTMLInputElement).value;
                couponError.value = "";
              },
              onKeydown: (event: KeyboardEvent) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyCoupon();
                }
              },
            }),
            button("Apply", applyCoupon, "primary", busy.value),
          ]),
          h(
            "div",
            { class: "coupon-offer-list", "aria-label": "Available coupons" },
            [
              h("div", { class: "coupon-offer-row" }, [
                h("code", "solai26"),
                h("span", "10% off"),
              ]),
              h("div", { class: "coupon-offer-row" }, [
                h("code", "santhoshhere341"),
                h("span", "8% off"),
              ]),
            ],
          ),
          h(
            "p",
            { class: "coupon-conditions" },
            "Subtotal above ¥20,000 after offers, before tax. One coupon per order.",
          ),
          subtotal.value <= 20000
            ? h(
                "p",
                { class: "coupon-unlock" },
                "Add " +
                  money(20001 - subtotal.value) +
                  " more to unlock coupons.",
              )
            : null,
          couponError.value
            ? h(
                "p",
                { class: "coupon-error", role: "alert" },
                couponError.value,
              )
            : null,
          appliedCoupon.value
            ? h("div", { class: "coupon-applied" }, [
                h(
                  "span",
                  "✓ " +
                    appliedCoupon.value +
                    " · " +
                    coupon.value.percent +
                    "% off",
                ),
                button(
                  "Remove",
                  () => {
                    appliedCoupon.value = "";
                    couponCelebration.value = null;
                  },
                  "text",
                  busy.value,
                ),
              ])
            : null,
        ]),
        h("div", { class: "summary-line" }, [
          h(
            "span",
            `Subtotal (${count.value} ${count.value === 1 ? "item" : "items"})`,
          ),
          h("strong", money(subtotal.value)),
        ]),
        discount.value > 0
          ? h("div", { class: "summary-line coupon-savings" }, [
              h("span", `Coupon (${coupon.value.percent}%)`),
              h("strong", `−${money(discount.value)}`),
            ])
          : null,
        growth.redeem(subtotal.value-discount.value),
        rewardDiscount.value>0?h("div",{class:"summary-line coupon-savings"},[h("span","Loyalty points"),h("strong",`−${money(rewardDiscount.value)}`)]):null,
        h("div", { class: "summary-line" }, [
          h("span", "Estimated tax (10%)"),
          h("span", money(tax.value)),
        ]),
        h("div", { class: "summary-line" }, [
          h("span", "Delivery"),
          h("strong", { class: "green" }, "Free"),
        ]),
        h("div", { class: "summary-total" }, [
          h("span", "Total"),
          h("strong", money(total.value)),
        ]),
        checkout
          ? h(
              "button",
              {
                class: "btn primary full",
                type: "submit",
                form: "checkout-form",
                disabled: busy.value || !cartValid.value,
              },
              [
                busy.value
                  ? "Preparing checkout…"
                  : paymentMethod.value === "cod"
                    ? "Place order · Cash on Delivery"
                    : paymentMethod.value.startsWith("demo_")
                      ? "Continue to demo payment"
                      : "Continue to test payment",
                icon("arrow"),
              ],
            )
          : button(
              "Proceed to checkout",
              beginCheckout,
              "primary full",
              !cartValid.value || loading.value,
              "arrow",
            ),
        h("p", { class: "fine-print" }, [
          icon("shield"),
          paymentMethod.value === "cod"
            ? "Cash on Delivery is unpaid until collected."
            : paymentMethod.value.startsWith("demo_")
              ? "Demo checkout uses fictional details and never charges money."
              : "Cards and QR payments open the provider’s test checkout.",
        ]),
        !cartValid.value && cart.value.length
          ? h(
              "p",
              { class: "form-error" },
              "Some quantities are no longer available. Update your cart.",
            )
          : null,
      ]);
    }
    function quantityControl(item: CartItem, product: Product) {
      return h("div", { class: "quantity" }, [
        button(
          "−",
          () => quantity(item.productId, item.quantity - 1),
          "plain",
          busy.value,
        ),
        h("span", String(item.quantity)),
        button(
          "+",
          () => quantity(item.productId, item.quantity + 1),
          "plain",
          busy.value || item.quantity >= Math.min(product.stock, 1000),
        ),
      ]);
    }
    function shop() {
      return [
        !search.value && department.value === "All products"
          ? h(ShopHero, {
              onExplore: (value: string) => {
                department.value = value;
                void nextTick(() =>
                  document
                    .getElementById("collection")
                    ?.scrollIntoView({ behavior: "smooth" }),
                );
              },
            })
          : null,
        h(
          "div",
          { class: "benefits" },
          [
            ["truck", "Delivery, on us", "Free delivery on every order"],
            [
              "shield",
              "Shop with clarity",
              "See available stock before you buy",
            ],
            [
              "download",
              "Keep your receipt",
              "Download a PDF after confirmation",
            ],
          ].map(([i, t, s]) =>
            h("div", [icon(i), h("span", [h("strong", t), h("small", s)])]),
          ),
        ),
        h("section", { id: "collection", class: "collection" }, [
          h("div", { class: "section-heading" }, [
            h("div", [
              h(
                "span",
                { class: "eyebrow" },
                search.value
                  ? "YOUR SEARCH"
                  : "A LITTLE SOMETHING FOR EVERY DAY",
              ),
              h(
                "h2",
                search.value
                  ? `Results for “${search.value}”`
                  : department.value === "All products"
                    ? "Discover your next favorite"
                    : department.value,
              ),
              h(
                "p",
                { class: "muted" },
                `${displayed.value.length} thoughtfully selected ${displayed.value.length === 1 ? "essential" : "essentials"}`,
              ),
            ]),
            h(
              "select",
              {
                value: sort.value,
                "aria-label": "Sort products",
                onChange: (e: Event) =>
                  (sort.value = (e.target as HTMLSelectElement).value),
              },
              [
                h("option", { value: "featured" }, "Sort: Featured"),
                h("option", { value: "low" }, "Price: Low to high"),
                h("option", { value: "high" }, "Price: High to low"),
                h("option", { value: "name" }, "Name: A to Z"),
                h("option", { value: "newest" }, "Newest arrivals"),
                h("option", { value: "discount" }, "Biggest discount"),
              ],
            ),
          ]),

          h("div", { class: "filter-row" }, [
            h(
              "div",
              { class: "chips" },
              categories.map((c) =>
                button(
                  c,
                  () => (department.value = c),
                  department.value === c ? "chip active" : "chip",
                ),
              ),
            ),
          ]),
          department.value !== "All products"
            ? h(
                "section",
                {
                  class: "catalog-subcategories",
                  "aria-label": "Subcategories",
                },
                [
                  h("strong", "Browse by type"),
                  h("div", { class: "subcategory-chips" }, [
                    h(
                      "button",
                      {
                        type: "button",
                        "aria-pressed": subcategory.value === "",
                        onClick: () => {
                          subcategory.value = "";
                        },
                      },
                      [
                        h("span", "All types"),
                        h("small", String(filteredCatalog.value.length)),
                      ],
                    ),
                    ...subcategoryOptions.value.map((option) =>
                      h(
                        "button",
                        {
                          type: "button",
                          "aria-pressed": subcategory.value === option.label,
                          disabled:
                            !option.count && subcategory.value !== option.label,
                          onClick: () => {
                            subcategory.value = option.label;
                          },
                        },
                        [
                          h("span", option.label),
                          h("small", String(option.count)),
                        ],
                      ),
                    ),
                  ]),
                ],
              )
            : null,
          h(
            "div",
            {
              class: "catalog-filter-panel",
              role: "group",
              "aria-label": "Price & inventory",
            },
            [
              h("div", { class: "catalog-price-fields" }, [
                ...(
                  [
                    ["Minimum price (JPY)", minimumPrice],
                    ["Maximum price (JPY)", maximumPrice],
                  ] as const
                ).flatMap(([label, value], index) => [
                  index
                    ? h(
                        "span",
                        {
                          class: "catalog-price-divider",
                          "aria-hidden": "true",
                        },
                        "—",
                      )
                    : null,
                  h("label", { class: "catalog-price-field" }, [
                    h("span", label),
                    h("span", { class: "catalog-price-input" }, [
                      h(
                        "span",
                        { class: "catalog-currency", "aria-hidden": "true" },
                        "¥",
                      ),
                      h("input", {
                        type: "number",
                        inputmode: "numeric",
                        min: 0,
                        max: 9999999,
                        step: 1,
                        value: value.value,
                        placeholder: "Any",
                        onInput: (event: Event) => {
                          value.value = (
                            event.target as HTMLInputElement
                          ).value;
                        },
                      }),
                    ]),
                  ]),
                ]),
              ]),
              h(
                "div",
                { class: "catalog-toggle-group" },
                (
                  [
                    ["In stock only", onlyStock],
                    ["Offers only", offersOnly],
                  ] as const
                ).map(([label, value]) =>
                  h("label", { class: "catalog-filter-toggle" }, [
                    h("input", {
                      type: "checkbox",
                      role: "switch",
                      checked: value.value,
                      onChange: (event: Event) => {
                        value.value = (
                          event.target as HTMLInputElement
                        ).checked;
                      },
                    }),
                    h("span", label),
                  ]),
                ),
              ),
              button("Clear filters", clearCatalogFilters, "secondary"),
            ],
          ),
          productPagination(),
          loading.value
            ? h(
                "div",
                { class: "product-grid" },
                Array.from({ length: 8 }, () =>
                  h("div", { class: "product-card skeleton" }, [
                    h("div"),
                    h("p"),
                    h("p"),
                  ]),
                ),
              )
            : displayed.value.length
              ? h(
                  "div",
                  { class: "product-grid" },
                  visibleProducts.value.map((p, i) =>
                    h(
                      "article",
                      {
                        class: "product-card",
                        key: p.id,
                        style: { animationDelay: `${Math.min(i, 7) * 40}ms` },
                      },
                      [
                        h(
                          "button",
                          {
                            class: `art-button tone-${i % 4}`,
                            onClick: () => (detail.value = p),
                            "aria-label": `View ${p.name}`,
                          },
                          [
                            art(p),
                            familyStock(p) === 0
                              ? h(
                                  "span",
                                  { class: "product-label sold-out" },
                                  "Out of stock",
                                )
                              : familyStock(p) <= 5
                                ? h(
                                    "span",
                                    { class: "product-label low" },
                                    "Almost gone",
                                  )
                                : null,
                          ],
                        ),
                        h("div", { class: "product-info" }, [
                          h("small", { class: "category-label" }, category(p)),
                          h(
                            "button",
                            {
                              class: "product-title",
                              onClick: () => (detail.value = p),
                            },
                            p.name,
                          ),
                          h(
                            "p",
                            { class: "product-description" },
                            productDescription(p.description) ||
                              "An essential, made for your everyday.",
                          ),
                          h("div", { class: "stock-line" }, [
                            h("span", {
                              class: `stock-dot ${familyStock(p) === 0 ? "empty" : familyStock(p) <= 5 ? "low" : ""}`,
                            }),
                            familyStock(p) === 0
                              ? "Currently unavailable"
                              : p.variants?.length
                                ? `${familyStock(p)} across options`
                                : `${p.stock} in stock`,
                            cart.value.some((i) => i.productId === p.id)
                              ? h(
                                  "span",
                                  { class: "in-cart" },
                                  `${cart.value.find((i) => i.productId === p.id)?.quantity ?? 0} in cart`,
                                )
                              : null,
                          ]),
                          shopping.compareButton(p),
                          offerTimer(p),
                          h("div", { class: "product-bottom" }, [
                            h("div", [
                              productDetails(p).discountPercent > 0
                                ? h(
                                    "span",
                                    { class: "sale-tag" },
                                    `${productDetails(p).discountPercent}% OFF`,
                                  )
                                : null,
                              h("strong", { class: "price" }, money(p.price)),
                              productDetails(p).discountPercent > 0
                                ? h(
                                    "del",
                                    { class: "fine-print" },
                                    money(productDetails(p).basePrice),
                                  )
                                : null,
                              paymentSettings.value.fx
                                ? h(
                                    "small",
                                    { class: "converted-price" },
                                    "≈ " +
                                      money(
                                        p.price * paymentSettings.value.fx.rate,
                                        "INR",
                                      ),
                                  )
                                : null,
                            ]),
                            button(
                              p.variants?.length
                                ? "Choose options"
                                : "Add to cart",
                              () => {
                                if (p.variants?.length) detail.value = p;
                                else add(p);
                              },
                              "primary small",
                              familyStock(p) === 0 || busy.value,
                              "plus",
                            ),
                          ]),
                        ]),
                      ],
                    ),
                  ),
                )
              : h("div", { class: "empty-state card" }, [
                  icon("search"),
                  h(
                    "h2",
                    catalog.value.length
                      ? "No matching products"
                      : "Your collection is on its way",
                  ),
                  h(
                    "p",
                    catalog.value.length
                      ? "Try another search or clear your filters."
                      : "Staff can add products from the inventory workspace.",
                  ),
                  catalog.value.length
                    ? button("Clear filters", clearCatalogFilters, "secondary")
                    : button(
                        "Refresh collection",
                        () => void loadCatalog(),
                        "secondary",
                      ),
                ]),
          displayed.value.length && !loading.value
            ? productPagination(true)
            : null,
        ]),
      ];
    }
    function cartPage() {
      return [
        h("div", { class: "page-heading" }, [
          button(
            "Continue shopping",
            () => navigate("shop"),
            "text",
            false,
            "back",
          ),
          h("h1", "Your shopping cart"),
          h(
            "p",
            { class: "muted" },
            `${count.value} ${count.value === 1 ? "item" : "items"}, ready for your everyday.`,
          ),
        ]),
        cart.value.length
          ? h("div", { class: "checkout-layout" }, [
              h(
                "div",
                { class: "card cart-items" },
                lines.value.map(({ item, product }) =>
                  product
                    ? h("article", { class: "cart-row" }, [
                        art(product),
                        h("div", { class: "cart-item-copy" }, [
                          h(
                            "small",
                            { class: "category-label" },
                            category(product),
                          ),
                          h("h3", product.name),
                          h(
                            "p",
                            {
                              class:
                                item.quantity > product.stock
                                  ? "form-error"
                                  : "muted",
                            },
                            product.stock
                              ? `${product.stock} available`
                              : "Out of stock",
                          ),
                          quantityControl(item, product),
                        ]),
                        h("div", { class: "cart-item-price" }, [
                          h("strong", money(product.price * item.quantity)),
                          h("small", `${money(product.price)} each`),
                          button(
                            "Remove",
                            () => quantity(item.productId, 0),
                            "text",
                            busy.value,
                            "trash",
                          ),
                        ]),
                      ])
                    : h("div", { class: "cart-row" }, [
                        h("p", "This product is no longer available."),
                        button(
                          "Remove",
                          () => quantity(item.productId, 0),
                          "text",
                        ),
                      ]),
                ),
              ),
              summary(),
            ])
          : h("div", { class: "empty-state card" }, [
              icon("cart"),
              h("h2", "Good things belong in your cart"),
              h("p", "Explore the collection and find something you love."),
              button("Start exploring", () => navigate("shop")),
            ]),
      ];
    }
    function checkoutPage() {
      if (!token.value)
        return [
          h("div", { class: "empty-state card" }, [
            h("h2", "Sign in to continue"),
            button("Sign in", openLogin),
          ]),
        ];
      return [
        h("div", { class: "page-heading" }, [
          button("Back to cart", () => navigate("cart"), "text", false, "back"),
          h("h1", "A few details, then you’re all set."),
          h(
            "p",
            { class: "muted" },
            "Review your delivery details and confirm your order.",
          ),
        ]),
        h("div", { class: "checkout-layout" }, [
          h("div", [
            h(
              "form",
              {
                id: "checkout-form",
                class: "card delivery-form",
                onSubmit: placeOrder,
              },
              [
                h("h2", [
                  h("span", { class: "step" }, "1"),
                  "Delivery details",
                ]),
                shopping.addressPicker(delivery),
                ...(
                  [
                    ["name", "Full name", "Your full name", 100],
                    [
                      "address",
                      "Street address",
                      "Building, street, apartment",
                      200,
                    ],
                    ["city", "City / region", "City and prefecture", 100],
                    ["postalCode", "Postal code", "Postal code", 30],
                  ] as const
                ).map(([key, label, placeholder, max]) =>
                  h("label", { class: "field" }, [
                    h("span", label),
                    h("input", {
                      value: delivery[key],
                      required: true,
                      maxlength: max,
                      autocomplete: {
                        name: "name",
                        address: "street-address",
                        city: "address-level2",
                        postalCode: "postal-code",
                      }[key],
                      placeholder,
                      onInput: (e: Event) =>
                        (delivery[key] = (e.target as HTMLInputElement).value),
                    }),
                  ]),
                ),
              ],
            ),
            h("section", { class: "card review-card" }, [
              h("h2", [h("span", { class: "step" }, "2"), "Review your items"]),
              ...lines.value.map(({ item, product }) =>
                h("div", { class: "review-line" }, [
                  h(
                    "span",
                    `${product?.name ?? "Unavailable item"} × ${item.quantity}`,
                  ),
                  h("strong", money((product?.price ?? 0) * item.quantity)),
                ]),
              ),
              h(
                "p",
                { class: "fine-print" },
                "Availability is checked again at checkout. Demo options use fictional details; online gateway details stay with the provider.",
              ),
            ]),
          ]),
          h("div", { class: "checkout-payment-column" }, [
            paymentChoices(),
            summary(true),
          ]),
        ]),
      ];
    }
    async function copyTrackingReference(order: Order) {
      try {
        await navigator.clipboard.writeText(trackingReference(order.id));
        notify("Tracking reference copied.");
      } catch {
        notify("Select the tracking reference to copy it.");
      }
    }
    function orderCard(order: Order) {
      const onlineOrder =
        !!order.receipt?.payment && order.receipt.payment.provider !== "cod";
      return h("article", { class: "order-card card", key: order.id }, [
        h("div", { class: "order-top" }, [
          h("div", [
            h("small", "ORDER PLACED"),
            h("strong", date(order.createdAt)),
          ]),
          h("div", [
            h("small", "ORDER NUMBER"),
            h("code", order.id.slice(0, 8).toUpperCase()),
          ]),
          h("div", [
            h("small", "TOTAL"),
            h(
              "strong",
              order.receipt ? money(order.receipt.total) : "Earlier order",
            ),
          ]),
          badge(order.status),
        ]),
        order.status === "confirmed"
          ? h("div", { class: "order-progress-summary" }, [
              h("div", [
                h(
                  "strong",
                  trackingLabel(order.receipt?.tracking?.stage ?? "confirmed"),
                ),
                h(
                  "small",
                  order.receipt?.tracking?.expectedDeliveryAt
                    ? `Demo arrival · ${date(order.receipt.tracking.expectedDeliveryAt)}`
                    : "Delivery details for this order",
                ),
              ]),
              button(
                "Track order",
                () => openTracking(order),
                "secondary",
                false,
                "truck",
              ),
            ])
          : null,
        h("div", { class: "order-reference-row" }, [
          h("span", "Tracking reference"),
          h("code", { class: "reference-code" }, trackingReference(order.id)),
          button(
            "Copy reference",
            () => {
              void copyTrackingReference(order);
            },
            "secondary small",
          ),
          button(
            "Track by reference",
            () => {
              referenceTracking.prefill(trackingReference(order.id));
              navigate("track-reference");
            },
            "secondary small",
          ),
        ]),
        order.receipt?.coupon
          ? h(
              "p",
              { class: "coupon-savings" },
              "Coupon " +
                order.receipt.coupon.code +
                " saved " +
                money(order.receipt.discount ?? 0),
            )
          : null,
        h("div", { class: "order-body" }, [
          h(
            "div",
            { class: "order-products" },
            order.items.map((item) =>
              h("div", { class: "order-product" }, [
                h("div", {
                  class: "mini-art",
                  innerHTML: artSvg({ name: item.name, description: "" }),
                }),
                h("span", [
                  h("strong", item.name),
                  h("small", `${item.quantity} × ${money(item.unitPrice)}`),
                ]),
              ]),
            ),
          ),
          h("div", { class: "order-actions" }, [
            button("Get help with this order",()=>{growth.forOrder(order.id);navigate("support");},"secondary small"),
            order.receipt?.payment
              ? h(
                  "p",
                  { class: "payment-state" },
                  order.receipt.payment.provider.toUpperCase() +
                    " · " +
                    order.receipt.payment.state +
                    " · " +
                    money(
                      order.receipt.payment.amountMinor /
                        (order.receipt.payment.currency === "INR" ? 100 : 1),
                      order.receipt.payment.currency,
                    ),
                )
              : null,
            order.receipt?.payment?.state === "refund_pending"
              ? button(
                  "Check refund",
                  () => void refreshPayment(order),
                  "secondary",
                  busy.value,
                )
              : null,
            order.status === "confirmed" && order.receipt?.confirmedAt
              ? button(
                  downloading.value === order.id
                    ? "Preparing PDF…"
                    : "Download receipt",
                  () => void pdf(order),
                  "secondary",
                  !!downloading.value,
                  "download",
                )
              : null,
            order.status === "pending" && onlineOrder
              ? h("div", { class: "pending-payment-actions" }, [
                  button(
                    "Resume payment",
                    () => void resumeSavedPayment(order),
                    "primary",
                    busy.value,
                  ),
                  button(
                    "Check payment",
                    () => void refreshPayment(order),
                    "secondary",
                    busy.value,
                  ),
                ])
              : order.status === "pending"
                ? button(
                    "Confirm order",
                    () => void confirmPending(order),
                    "primary",
                    busy.value,
                  )
                : null,
            order.status !== "cancelled" &&
            !["shipped", "out_for_delivery", "delivered"].includes(
              order.receipt?.tracking?.stage ?? "",
            )
              ? button(
                  "Cancel order",
                  () => (cancelTarget.value = order),
                  "text danger",
                  busy.value,
                )
              : h(
                  "small",
                  { class: "muted" },
                  order.status === "cancelled"
                    ? "Stock returned for confirmed items"
                    : "Contact staff to arrange a return",
                ),
          ]),
        ]),
      ]);
    }
    function orderPageView() {
      return [
        h("div", { class: "page-heading" }, [
          h("span", { class: "eyebrow" }, "YOUR ACCOUNT"),
          h("h1", "Your orders"),
          h(
            "p",
            { class: "muted" },
            "Everything you’ve ordered, with receipts in one place.",
          ),
        ]),
        !token.value
          ? h("div", { class: "empty-state card" }, [
              h("h2", "Sign in to view your orders"),
              button("Sign in", openLogin),
            ])
          : orders.value.length
            ? [
                ...orders.value.map(orderCard),
                h("div", { class: "pager" }, [
                  button(
                    "Previous",
                    () => {
                      orderPage.value--;
                      void loadOrders();
                    },
                    "secondary",
                    orderPage.value <= 1,
                  ),
                  h(
                    "span",
                    `Page ${orderPage.value} of ${Math.max(1, Math.ceil(orderTotal.value / 10))}`,
                  ),
                  button(
                    "Next",
                    () => {
                      orderPage.value++;
                      void loadOrders();
                    },
                    "secondary",
                    orderPage.value * 10 >= orderTotal.value,
                  ),
                ]),
              ]
            : h("div", { class: "empty-state card" }, [
                icon("box"),
                h("h2", "Your first good find is waiting"),
                h("p", "Your confirmed orders will appear here."),
                button("Explore the collection", () => navigate("shop")),
              ]),
      ];
    }
    function success() {
      const order = lastOrder.value;
      return [
        h("section", { class: "success card" }, [
          h("div", { class: "success-check" }, icon("check")),
          h("span", { class: "eyebrow" }, "IT’S OFFICIAL"),
          h("h1", "A good choice. All yours."),
          h(
            "p",
            order?.receipt?.payment?.state === "due"
              ? "Your order is placed. Payment is due on delivery; stock has been updated."
              : order?.receipt?.payment?.provider.startsWith("demo_")
                ? "Demo completed. No money charged; receipt ready."
                : "Your payment is verified and stock has been updated.",
          ),
          order
            ? h(
                "p",
                { class: "order-reference" },
                `Order #${order.id.slice(0, 8).toUpperCase()}`,
              )
            : null,
          h("div", { class: "success-actions" }, [
            order
              ? button(
                  downloading.value ? "Preparing PDF…" : "Download PDF receipt",
                  () => void pdf(order),
                  "primary",
                  !!downloading.value,
                  "download",
                )
              : null,
            button("View your orders", () => navigate("orders"), "secondary"),
          ]),
          button(
            "Keep exploring",
            () => navigate("shop"),
            "text",
            false,
            "arrow",
          ),
          h(
            "p",
            { class: "fine-print" },
            order?.receipt?.payment?.state === "due"
              ? "Cash on Delivery: no online payment was collected."
              : order?.receipt?.payment?.provider.startsWith("demo_")
                ? "Demo payments use fictional details. No bank, card or wallet is charged."
                : "Online payments use your merchant test/sandbox account.",
          ),
        ]),
        order ? orderCard(order) : null,
      ];
    }
    function modal() {
      if (!modalOpen.value) return null;
      const currentProduct = selectedDetail.value;
      return h(
        "div",
        {
          class: "modal-backdrop",
          onClick: (e: MouseEvent) => {
            if (e.target === e.currentTarget) closeModal();
          },
        },
        [
          h(
            "section",
            {
              class: `dialog ${loginOpen.value ? "customer-login-dialog" : detail.value ? "detail-dialog" : ""}`,
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "dialog-title",
            },
            [
              h(
                "button",
                {
                  class: "icon-button close-dialog",
                  "aria-label": "Close dialog",
                  onClick: closeModal,
                  disabled: busy.value,
                },
                icon("close"),
              ),
              loginOpen.value
                ? accountLogin.view(() => [
                    h("span", { class: "eyebrow" }, "WELCOME BACK"),
                    h(
                      "h2",
                      { id: "dialog-title" },
                      "Your next good find awaits.",
                    ),
                    h(
                      "p",
                      { class: "muted" },
                      "Sign in to checkout and keep track of your orders.",
                    ),
                    h("form", { onSubmit: signIn }, [
                      h("label", { class: "field" }, [
                        h("span", "Email address"),
                        h("input", {
                          type: "email",
                          required: true,
                          autocomplete: "username",
                          value: credentials.username,
                          onInput: (e: Event) =>
                            (credentials.username = (
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
                          value: credentials.password,
                          onInput: (e: Event) =>
                            (credentials.password = (
                              e.target as HTMLInputElement
                            ).value),
                        }),
                      ]),
                      error.value
                        ? h(
                            "p",
                            { class: "form-error", role: "alert" },
                            error.value,
                          )
                        : null,
                      h(
                        "button",
                        {
                          type: "submit",
                          class: "btn primary full",
                          disabled: busy.value,
                        },
                        busy.value ? "Signing in…" : "Sign in",
                      ),
                    ]),
                    h("div", { class: "local-login" }, [
                      h("small", "LOCAL TRAINING ACCOUNTS"),
                      h("p", "Customer: buyer@example.test"),
                      h("p", "Staff: admin@example.test"),
                      h("p", "Password: Training2-local!"),
                      button(
                        "Use staff account",
                        () => (credentials.username = "admin@example.test"),
                        "text",
                      ),
                    ]),
                  ])
                : detail.value && currentProduct
                  ? [
                      art(currentProduct, true),
                      h("div", { class: "detail-copy" }, [
                        h(
                          "span",
                          { class: "eyebrow" },
                          category(currentProduct),
                        ),
                        h("h2", { id: "dialog-title" }, currentProduct.name),
                        detail.value.variants?.length
                          ? h("div", { class: "variant-picker" }, [
                              h("label", [
                                h("span", "Choose your option"),
                                h(
                                  "select",
                                  {
                                    value: selectedOption.value,
                                    onChange: (event: Event) => {
                                      selectedOption.value = (
                                        event.target as HTMLSelectElement
                                      ).value;
                                    },
                                  },
                                  [
                                    h(
                                      "option",
                                      { value: detail.value.id },
                                      `Standard · ${money(detail.value.price)} · ${detail.value.stock} available`,
                                    ),
                                    ...detail.value.variants.map((variant) =>
                                      h(
                                        "option",
                                        { value: variant.id },
                                        `${variant.label} · ${money(variant.price)} · ${variant.stock} available`,
                                      ),
                                    ),
                                  ],
                                ),
                              ]),
                              h(
                                "small",
                                "Each option has its own price and stock.",
                              ),
                            ])
                          : null,
                        offerTimer(currentProduct),
                        h(
                          "p",
                          { class: "muted" },
                          productDescription(currentProduct.description) ||
                            "Thoughtfully selected for your everyday.",
                        ),
                        h(
                          "strong",
                          { class: "detail-price" },
                          money(currentProduct.price),
                        ),
                        productDetails(currentProduct).discountPercent > 0
                          ? h("p", [
                              h(
                                "span",
                                { class: "sale-tag" },
                                `${productDetails(currentProduct).discountPercent}% OFF`,
                              ),
                              " ",
                              h(
                                "del",
                                money(productDetails(currentProduct).basePrice),
                              ),
                            ])
                          : null,
                        h(
                          "p",
                          { class: "stock-line" },
                          `${currentProduct.stock} available · ${currentProduct.code}`,
                        ),
                        button(
                          "Add to cart",
                          () => {
                            const product = currentProduct;
                            if (product) add(product);
                          },
                          "primary full",
                          currentProduct.stock === 0,
                          "plus",
                        ),
                        h(
                          "p",
                          { class: "fine-print" },
                          "Free delivery. Estimated tax is shown at checkout.",
                        ),
                      ]),
                    ]
                  : [
                      h("h2", { id: "dialog-title" }, "Cancel this order?"),
                      h(
                        "p",
                        { class: "muted" },
                        "Cash-on-delivery cancellation restores stock immediately. Online payments are refunded through the provider; stock returns after the refund is confirmed.",
                      ),
                      error.value
                        ? h("p", { class: "form-error" }, error.value)
                        : null,
                      h("div", { class: "dialog-actions" }, [
                        button(
                          "Keep order",
                          closeModal,
                          "secondary",
                          busy.value,
                        ),
                        button(
                          busy.value ? "Cancelling…" : "Yes, cancel order",
                          () => void cancelOrder(),
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
    return () =>
      h("div", { class: "shop-app" }, [
        h("a", { href: "#main", class: "skip-link" }, "Skip to content"),
        h(
          "div",
          { class: "announcement" },
          h("div", { class: "offer-track" }, [
            h(
              "span",
              "Launch offers · 50% off selected new arrivals · While stocks last · Free delivery",
            ),
            h(
              "span",
              { "aria-hidden": "true" },
              "Launch offers · 50% off selected new arrivals · While stocks last · Free delivery",
            ),
          ]),
        ),
        h("header", { class: "shop-header" }, [
          h("div", { class: "header-inner" }, [
            h(
              "button",
              {
                class: "brand",
                onClick: () => navigate("shop"),
                "aria-label": "Solaistore home",
              },
              [
                h("span", { class: "brand-mark" }, growth.settings.value.name[0]),
                h("span", growth.settings.value.name),
              ],
            ),
            h(
              "form",
              {
                class: "search-box",
                onSubmit: (e: Event) => {
                  e.preventDefault();
                  navigate("shop");
                  document
                    .getElementById("collection")
                    ?.scrollIntoView({ behavior: "smooth" });
                },
              },
              [
                icon("search"),
                h("input", {
                  value: search.value,
                  placeholder: "Search for your next good find…",
                  "aria-label": "Search products",
                  onInput: (e: Event) => {
                    search.value = (e.target as HTMLInputElement).value;
                    if (page.value !== "shop") navigate("shop");
                  },
                }),
                search.value
                  ? h(
                      "button",
                      {
                        type: "button",
                        class: "icon-button",
                        "aria-label": "Clear search",
                        onClick: () => (search.value = ""),
                      },
                      icon("close"),
                    )
                  : null,
              ],
            ),
            h("div", { class: "header-actions" }, [
              languageSelect(),
              themeToggle(),
              h(
                "button",
                {
                  class: "header-account",
                  onClick: () =>
                    token.value ? navigate("orders") : openLogin(),
                },
                [
                  icon("user"),
                  h("span", [
                    h(
                      "small",
                      token.value
                        ? `Hello, ${customer.value}`
                        : "Hello, welcome",
                    ),
                    h("strong", token.value ? "Your orders" : "Sign in"),
                  ]),
                ],
              ),
              h(
                "button",
                {
                  class: `cart-nav ${page.value === "cart" ? "active" : ""}`,
                  onClick: () => navigate("cart"),
                },
                [
                  icon("cart"),
                  h("span", "Cart"),
                  h("b", { class: "cart-count" }, String(count.value)),
                ],
              ),
              token.value
                ? h(
                    "button",
                    {
                      class: "icon-button",
                      "aria-label": "Sign out",
                      onClick: () => logout(),
                    },
                    icon("logout"),
                  )
                : null,
            ]),
          ]),
        ]),
        h(
          "nav",
          { class: "department-nav", "aria-label": "Product categories" },
          [
            h("div", { class: "department-inner" }, [
              ...categories.map((c) =>
                h(
                  "button",
                  {
                    class: department.value === c ? "selected" : "",
                    onClick: () => {
                      department.value = c;
                      search.value = "";
                      navigate("shop");
                    },
                  },
                  c,
                ),
              ),
              h(
                "span",
                {
                  class: `live-indicator ${online.value ? "" : "offline"}`,
                  title: synced.value
                    ? `Updated ${synced.value}. Refreshes every 4 seconds.`
                    : "Connecting…",
                },
                [
                  h("i"),
                  online.value
                    ? syncing.value
                      ? "Updating stock…"
                      : "Stock updates every 4s"
                    : "Updates paused",
                ],
              ),
            ]),
          ],
        ),
        growth.settings.value.announcement ? h("div",{class:"growth-announcement"},growth.settings.value.announcement):null,
        h("main", { id: "main", class: "shop-main" }, [
          !online.value
            ? h("div", { class: "connection-banner", role: "status" }, [
                "Stock updates are paused. Displayed quantities may be out of date. ",
                button("Retry", () => void loadCatalog(), "text"),
              ])
            : null,
          error.value && !loginOpen.value && !cancelTarget.value
            ? h("div", { class: "error-banner", role: "alert" }, [
                h("span", error.value),
                button("Dismiss", () => (error.value = ""), "text"),
              ])
            : null,
          h(
            "nav",
            {
              class: "shopping-tools-nav",
              "aria-label": "Shopping and account tools",
            },
            [
              button(
                "Your orders",
                () => navigate("orders"),
                "secondary small",
              ),
              button("Loyalty rewards",()=>navigate("loyalty"),"secondary small"),
              button("Customer support",()=>navigate("support"),"secondary small"),
              button(
                "Track by reference",
                () => navigate("track-reference"),
                "secondary small",
              ),
              button(
                "Saved addresses",
                () => navigate("addresses"),
                "secondary small",
              ),
              button(
                "Returns & refunds",
                () => navigate("returns"),
                "secondary small",
              ),
              button(
                `Compare (${shopping.comparisonIds.value.length})`,
                () => navigate("compare"),
                "secondary small",
              ),
            ],
          ),
          growth.cartBanner(),
          ...(page.value === "support" ? growth.supportPage() : page.value === "loyalty" ? growth.loyaltyPage() : page.value === "track-reference"
            ? referenceTracking.page()
            : page.value === "shop"
              ? shop()
              : page.value === "cart"
                ? cartPage()
                : page.value === "checkout"
                  ? checkoutPage()
                  : page.value === "orders"
                    ? orderPageView()
                    : page.value === "addresses"
                      ? shopping.addressesPage(openLogin)
                      : page.value === "returns"
                        ? shopping.returnsPage(openLogin)
                        : page.value === "compare"
                          ? shopping.comparisonPage()
                          : page.value === "tracking"
                            ? orderTrackingPage(trackedOrder.value, {
                                back: () => navigate("orders"),
                                refresh: () => void loadTrackedOrder(),
                                download: () => {
                                  if (trackedOrder.value)
                                    void pdf(trackedOrder.value);
                                },
                                signIn: () => {
                                  loginOpen.value = true;
                                },
                                signedIn: !!token.value,
                                busy: trackingLoading.value,
                                downloading: !!downloading.value,
                              })
                            : success()),
        ]),
        h("footer", { class: "shop-footer" }, [
          h("div", [
            h("strong", growth.settings.value.name),
            h("p", growth.settings.value.tagline),
          ]),
          h("span", "A local training store · JPY"),
          button(
            "Staff workspace",
            () => {
              const url = new URL(location.href);
              url.port = "5174";
              url.pathname = "/";
              url.hash = "";
              url.search = `?lang=${language.value}`;
              location.assign(url.href);
            },
            "text",
          ),
        ]),
        notice.value
          ? h("div", { class: "toast", role: "status" }, [
              icon("check"),
              notice.value,
            ])
          : null,
        couponCelebration.value
          ? h(
              "dialog",
              {
                class: "coupon-celebration",
                onVnodeMounted: (node: VNode) => {
                  const dialog = node.el as HTMLDialogElement;
                  if (!dialog.open) dialog.showModal();
                },
                onCancel: () => {
                  couponCelebration.value = null;
                },
                "aria-labelledby": "coupon-celebration-title",
                "aria-live": "polite",
              },
              [
                h(
                  "span",
                  { class: "coupon-sparkles", "aria-hidden": "true" },
                  "✦ ✧ ✦",
                ),
                button(
                  "×",
                  () => {
                    couponCelebration.value = null;
                  },
                  "text coupon-close",
                ),
                h(
                  "span",
                  { class: "coupon-success-icon", "aria-hidden": "true" },
                  "✓",
                ),
                h(
                  "strong",
                  { id: "coupon-celebration-title" },
                  "Coupon added!",
                ),
                h("p", [
                  "You saved ",
                  h("b", money(couponCelebration.value.saved)),
                ]),
                h("small", couponCelebration.value.code),
                button(
                  "Continue shopping",
                  () => {
                    couponCelebration.value = null;
                  },
                  "primary coupon-continue",
                ),
              ],
            )
          : null,
        modal(),
      ]);
  },
}).mount("#app");
