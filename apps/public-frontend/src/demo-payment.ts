import { t } from "../../../packages/ui/src/language.ts";
import type { Order } from "../../../packages/ui/src/storefront.ts";
import { money } from "../../../packages/ui/src/storefront.ts";
export function showDemoPayment(order: Order): Promise<void> {
  return new Promise((resolve, reject) => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.createElement("dialog");
    dialog.className = "demo-payment-dialog";
    const node = (tag: string, text: string, className = "") => {
      const el = document.createElement(tag);
      el.textContent = t(text);
      el.className = className;
      return el;
    };
    const finish = (success: boolean) => {
      dialog.close();
      dialog.remove();
      previous?.focus();
      success
        ? resolve()
        : reject(
            new Error(
              t(
                "Demo payment cancelled. Resume or cancel the saved order from Your orders.",
              ),
            ),
          );
    };
    dialog.append(
      node("span", "SOLAISTORE · DEMO ONLY", "eyebrow"),
      node(
        "h2",
        order.gateway?.provider === "demo_qr" ? "QR payment" : "Card payment",
      ),
      node(
        "p",
        "Demo payments use fictional details. No bank, card or wallet is charged.",
        "demo-notice",
      ),
    );
    dialog.append(
      node(
        "strong",
        money(
          (order.gateway?.amountMinor ?? 0) /
            (order.gateway?.currency === "INR" ? 100 : 1),
          order.gateway?.currency,
        ),
        "demo-total",
      ),
    );
    if (order.gateway?.provider === "demo_card") {
      const card = node("div", "", "fictional-card");
      card.append(
        node("small", "CARD"),
        node("strong", "4242 4242 4242 4242"),
        node("span", "SOLAISTORE   ·  EXP 12/30  ·  CVV 123"),
      );
      dialog.append(card);
      dialog.append(
        node(
          "p",
          "Use the supplied fictional card. Do not enter real card details.",
          "fine-print",
        ),
      );
    } else {
      const qr = node("div", "", "demo-qr-art");
      qr.setAttribute(
        "aria-label",
        "Demo QR illustration — not a payable code",
      );
      // A visual simulation only. No payment URL, bank account or wallet is encoded.
      for (let y = 0; y < 21; y++)
        for (let x = 0; x < 21; x++) {
          const finder = (ox: number, oy: number) => {
            const dx = x - ox,
              dy = y - oy;
            return dx >= 0 && dy >= 0 && dx < 7 && dy < 7
              ? dx === 0 ||
                  dy === 0 ||
                  dx === 6 ||
                  dy === 6 ||
                  (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
              : null;
          };
          const f = finder(0, 0) ?? finder(14, 0) ?? finder(0, 14);
          const cell = document.createElement("i");
          if (f ?? (x * 17 + y * 13 + x * y) % 7 < 3) cell.className = "dark";
          qr.append(cell);
        }
      dialog.append(
        qr,
        node(
          "p",
          "Illustration only · not scannable · no payment destination",
          "fine-print",
        ),
      );
    }
    const actions = node("div", "", "demo-actions");
    for (const [label, success] of [
      ["Cancel", false],
      ["Complete payment", true],
    ] as const) {
      const b = node(
        "button",
        label,
        success ? "btn primary" : "btn secondary",
      ) as HTMLButtonElement;
      b.type = "button";
      b.onclick = () => finish(success);
      actions.append(b);
    }
    dialog.append(actions);
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      finish(false);
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
