import { ref, watch } from "vue";
import { trackingReference, normalizeTrackingReference } from "../../../packages/api-contracts/src/tracking-reference.ts";
import { h } from "../../../packages/ui/src/language.ts";
import { trackingLabel } from "../../../packages/ui/src/order-tracking.ts";
import type { Requester } from "../../../packages/ui/src/shopping-tools.ts";
import type { Order } from "../../../packages/ui/src/storefront.ts";
import { date } from "../../../packages/ui/src/storefront.ts";
import "./reference-tracking.css";

export function useReferenceTracking(request: Requester, identity: () => string, signIn: () => void, openOrder: (order: Order) => void) {
  const input = ref(""), error = ref(""), busy = ref(false), result = ref<Order | null>(null), searched = ref("");
  let revision = 0;
  watch(identity, () => { revision++; result.value = null; searched.value = ""; busy.value = false; error.value = ""; });
  async function lookup(reference: string, background = false) {
    if (busy.value || !identity()) return;
    const normalized = normalizeTrackingReference(reference);
    if (!normalized) { error.value = "Enter your reference, for example SS-012345ABCDEF. You can copy it from Your orders."; result.value = null; searched.value = ""; return; }
    const current = ++revision, owner = identity();
    busy.value = true;
    if (!background) { result.value = null; error.value = ""; searched.value = ""; }
    try {
      const order = await request(`/account/track-reference?reference=${encodeURIComponent(normalized)}`) as Order;
      if (current !== revision || owner !== identity()) return;
      result.value = order; searched.value = normalized; error.value = "";
    } catch (failure) {
      if (current !== revision || owner !== identity()) return;
      error.value = (failure as Error).message;
      result.value = null; searched.value = "";
    } finally { if (current === revision) busy.value = false; }
  }
  function prefill(reference: string) { revision++; input.value = reference; result.value = null; searched.value = ""; error.value = ""; busy.value = false; }
  return {
    prefill,
    refresh: () => searched.value ? lookup(searched.value, true) : Promise.resolve(),
    page: () => [h("section", { class: "reference-page" }, [
      h("div", { class: "page-heading" }, [h("span", { class: "eyebrow" }, "FIND YOUR DELIVERY"), h("h1", "Track by reference number"), h("p", { class: "muted" }, "Paste the tracking reference from Your orders or your current tracking page.")]),
      h("form", { class: "card reference-search", onSubmit: (event: Event) => { event.preventDefault(); if (!identity()) signIn(); else void lookup(input.value); } }, [
        h("label", { for: "tracking-reference-input" }, "Tracking reference number"),
        h("div", { class: "reference-input-row" }, [h("input", { id: "tracking-reference-input", placeholder: "SS-012345ABCDEF", type: "text", maxlength: 40, autocapitalize: "characters", spellcheck: false, value: input.value, onInput: (e: Event) => { input.value = (e.target as HTMLInputElement).value; } }), h("button", { type: "submit", class: "btn primary", disabled: busy.value }, busy.value ? "Finding your order…" : identity() ? "Track order" : "Sign in to track")]),
        h("p", { class: "muted" }, "Example: SS-012345ABCDEF. Only orders belonging to your signed-in account can be found."),
      ]),
      error.value ? h("div", { class: "error-banner", role: "alert" }, error.value) : null,
      result.value ? h("section", { class: "card reference-result", "aria-label": "Tracking result", "aria-live": "polite" }, [
        h("span", { class: "eyebrow" }, "ORDER FOUND"), h("h2", trackingReference(result.value.id)),
        h("strong", { class: "reference-status" }, result.value.status === "cancelled" ? "Order cancelled" : result.value.status === "pending" ? "Waiting for confirmation" : trackingLabel(result.value.receipt?.tracking?.stage ?? "confirmed")),
        h("p", `Order #${result.value.id.slice(0, 8).toUpperCase()} · Placed ${date(result.value.createdAt)}`),
        result.value.status === "confirmed" && result.value.receipt?.tracking?.expectedDeliveryAt ? h("p", `Expected demo arrival: ${date(result.value.receipt.tracking.expectedDeliveryAt)}`) : null,
        h("p", { class: "muted" }, "Uses the same automatic demo delivery updates as your current tracking page. This is a store demo reference, not a courier tracking number."),
        h("button", { type: "button", class: "btn primary", onClick: () => { if (result.value) openOrder(result.value); } }, "View full order tracking"),
      ]) : null,
    ])],
  };
}

