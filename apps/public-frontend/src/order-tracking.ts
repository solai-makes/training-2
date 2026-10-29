import { DELIVERY_STEPS } from "../../../packages/api-contracts/src/delivery-timeline.ts";
import { h } from "../../../packages/ui/src/language.ts";
import { trackingLabel } from "../../../packages/ui/src/order-tracking.ts";
import type { Order } from "../../../packages/ui/src/storefront.ts";
import {
  artSvg,
  date,
  iconSvg,
  money,
} from "../../../packages/ui/src/storefront.ts";
import "./order-tracking.css";

const icon = (name: string) =>
  h("span", { class: "icon", innerHTML: iconSvg(name), "aria-hidden": "true" });
type Actions = {
  back: () => void;
  refresh: () => void;
  download: () => void;
  signIn: () => void;
  signedIn: boolean;
  busy: boolean;
  downloading: boolean;
};
export function orderTrackingPage(order: Order | null, actions: Actions) {
  const tracking = order?.receipt?.tracking;
  const stage =
    tracking?.stage === "packed"
      ? "confirmed"
      : (tracking?.stage ?? "confirmed");
  const current = DELIVERY_STEPS.indexOf(stage);
  const btn = (
    label: string,
    action: () => void,
    kind = "secondary",
    disabled = false,
  ) =>
    h(
      "button",
      { type: "button", class: `btn ${kind}`, onClick: action, disabled },
      label,
    );
  return [
    h("section", { class: "delivery-page" }, [
      btn("← Back to your orders", actions.back, "text"),
      h("div", { class: "delivery-heading" }, [
        h("div", [
          h("span", { class: "eyebrow" }, "EVERY STEP, IN ONE PLACE"),
          h("h1", "Track your order"),
          h(
            "p",
            { class: "muted" },
            "A clear view of your delivery, from confirmation to your door.",
          ),
        ]),
        btn(
          actions.busy ? "Updating…" : "Refresh tracking",
          actions.refresh,
          "secondary",
          actions.busy || !actions.signedIn,
        ),
      ]),
      !actions.signedIn
        ? h("div", { class: "card delivery-empty" }, [
            h("h2", "Sign in to view your delivery"),
            btn("Sign in", actions.signIn, "primary"),
          ])
        : !order
          ? h(
              "div",
              { class: "card delivery-empty", role: "status" },
              actions.busy
                ? "Loading your delivery…"
                : "This order could not be loaded. Return to Your orders and try again.",
            )
          : h("div", [
              h("section", { class: "card delivery-hero" }, [
                h("div", { class: "delivery-hero-copy" }, [
                  h(
                    "span",
                    { class: "delivery-mode" },
                    "AUTOMATIC DEMO DELIVERY",
                  ),
                  h(
                    "h2",
                    order.status === "cancelled"
                      ? "This order was cancelled"
                      : order.status === "pending"
                        ? "Waiting for confirmation"
                        : tracking
                          ? trackingLabel(stage)
                          : "Confirmation received",
                  ),
                  h(
                    "p",
                    order.status !== "confirmed"
                      ? "The delivery timeline runs only for confirmed orders."
                      : tracking?.nextUpdateAt
                        ? `Next milestone: ${date(tracking.nextUpdateAt)}`
                        : tracking?.stage === "delivered"
                          ? "Your demo delivery timeline is complete."
                          : "Tracking is unavailable for this earlier order.",
                  ),
                  h("div", { class: "delivery-identifiers" }, [
                    h("div", [
                      h("small", "ORDER NUMBER"),
                      h("strong", `#${order.id.slice(0, 8).toUpperCase()}`),
                    ]),
                    h("div", [
                      h("small", "TRACKING REFERENCE"),
                      h(
                        "strong",
                        `SS-${order.id.replaceAll("-", "").slice(0, 12).toUpperCase()}`,
                      ),
                    ]),
                  ]),
                ]),
                h("div", { class: "delivery-arrival" }, [
                  icon(stage === "delivered" ? "check" : "truck"),
                  h("small", "EXPECTED DEMO ARRIVAL"),
                  h(
                    "strong",
                    order.status === "confirmed" && tracking?.expectedDeliveryAt
                      ? date(tracking.expectedDeliveryAt)
                      : "After order confirmation",
                  ),
                  h("span", "24 hours after confirmation"),
                ]),
              ]),
              order.status === "confirmed" && tracking
                ? h(
                    "section",
                    {
                      class: "card delivery-progress",
                      "aria-label": "Delivery milestones",
                    },
                    [
                      h("div", { class: "delivery-progress-heading" }, [
                        h("h2", "Your delivery journey"),
                        h(
                          "span",
                          { class: "delivery-live" },
                          "● Updates automatically",
                        ),
                      ]),
                      h(
                        "ol",
                        { class: "delivery-stepper" },
                        DELIVERY_STEPS.map((step, index) => {
                          const event = tracking.history.find(
                            (item) => item.stage === step,
                          );
                          const due = order.receipt?.confirmedAt
                            ? new Date(
                                Date.parse(order.receipt.confirmedAt) +
                                  [0, 3600000, 18000000, 86400000][index],
                              ).toISOString()
                            : null;
                          return h(
                            "li",
                            {
                              class: `delivery-milestone ${index <= current ? "complete" : ""} ${index < current ? "past" : ""} ${index === current ? "current" : ""}`,
                              "aria-current":
                                index === current ? "step" : undefined,
                            },
                            [
                              h(
                                "div",
                                { class: "milestone-dot" },
                                index <= current
                                  ? icon("check")
                                  : String(index + 1),
                              ),
                              h("div", { class: "milestone-copy" }, [
                                h(
                                  "span",
                                  { class: `milestone-symbol symbol-${index}` },
                                  icon(
                                    ["check", "box", "truck", "check"][index],
                                  ),
                                ),
                                h("strong", trackingLabel(step)),
                                h(
                                  "small",
                                  [
                                    "Order confirmed",
                                    "+1 hour",
                                    "+5 hours",
                                    "+24 hours",
                                  ][index],
                                ),
                                h(
                                  "time",
                                  { datetime: event?.at ?? due ?? undefined },
                                  event
                                    ? date(event.at)
                                    : due
                                      ? `Expected ${date(due)}`
                                      : "Awaiting update",
                                ),
                              ]),
                            ],
                          );
                        }),
                      ),
                      h(
                        "p",
                        { class: "delivery-disclosure" },
                        "This training store simulates delivery milestones from the saved confirmation time. No courier is connected. Timings continue correctly after a page refresh or server restart.",
                      ),
                    ],
                  )
                : null,
              h("div", { class: "delivery-details-grid" }, [
                h("section", { class: "card delivery-detail" }, [
                  h("h2", "Delivery details"),
                  order.receipt?.recipient
                    ? h("address", [
                        h("strong", order.receipt.recipient.name),
                        h("span", order.receipt.recipient.address),
                        h(
                          "span",
                          `${order.receipt.recipient.city} · ${order.receipt.recipient.postalCode}`,
                        ),
                      ])
                    : h(
                        "p",
                        "No delivery address was saved for this earlier order.",
                      ),
                  h("small", "Confirmation time"),
                  h(
                    "p",
                    order.receipt?.confirmedAt
                      ? date(order.receipt.confirmedAt)
                      : "Not confirmed yet",
                  ),
                ]),
                h("section", { class: "card delivery-detail" }, [
                  h("h2", "In this order"),
                  ...order.items.map((item) =>
                    h("div", { class: "delivery-item" }, [
                      h("div", {
                        class: "mini-art",
                        innerHTML: artSvg({ name: item.name, description: "" }),
                      }),
                      h("div", [
                        h("strong", item.name),
                        h(
                          "small",
                          `Quantity ${item.quantity} · ${money(item.lineTotal)}`,
                        ),
                      ]),
                    ]),
                  ),
                  h("div", { class: "delivery-order-total" }, [
                    h("span", "Order total"),
                    h("strong", money(order.receipt?.total ?? 0)),
                  ]),
                  order.status === "confirmed" && order.receipt?.confirmedAt
                    ? btn(
                        actions.downloading
                          ? "Preparing receipt…"
                          : "Download receipt PDF",
                        actions.download,
                        "secondary",
                        actions.downloading,
                      )
                    : null,
                ]),
              ]),
            ]),
    ]),
  ];
}
