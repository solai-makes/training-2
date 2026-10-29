import { reactive, ref } from "vue";
import {
  DEFAULT_SETTINGS,
  allowed,
  type Role,
  type Settings,
} from "../../../packages/api-contracts/src/store-growth.ts";
import { h } from "../../../packages/ui/src/language.ts";
import { date, money } from "../../../packages/ui/src/storefront.ts";
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
type Target = {
  period: string;
  startsOn: string;
  endsOn: string;
  amount: number | null;
  version: number;
  actual: number;
};
const button = (text: string, click: () => void, disabled = false) =>
  h(
    "button",
    { type: "button", class: "btn secondary", onClick: click, disabled },
    text,
  );
export function useStaffGrowth(
  request: Requester,
  notify: (text: string) => void,
) {
  const store = ref<Settings>({ ...DEFAULT_SETTINGS });
  const role = ref<Role | null>(null),
    error = ref(""),
    busy = ref(false),
    ready = ref(false),
    settingsVersion = ref(0);
  const form = reactive<Settings>({ ...DEFAULT_SETTINGS }),
    targetData = ref<{ items: Target[]; note: string }>({
      items: [],
      note: "",
    }),
    targetDraft = reactive<Record<string, string>>({});
  const targetVersions = reactive<Record<string,number>>({});
  const support = ref<Ticket[]>([]),
    selectedTicket = ref(""),
    reply = ref(""),
    replyStatus = ref("in_progress");
  const staff = ref<Array<{ principal: string; role: Role }>>([]),
    principal = ref(""),
    newRole = ref("inventory"),
    activity = ref<Array<{ actor: string; action: string; createdAt: string }>>(
      [],
    );
  const recovery = ref<{
    items: Array<{
      customer: string;
      updatedAt: string;
      quantity: number;
      value: number;
      abandoned: boolean;
    }>;
    note: string;
  }>({ items: [], note: "" });
  const json = <T>(path: string, options?: RequestInit) =>
    request(path, options) as Promise<T>;
  const can = (permission: string) => allowed(role.value, permission);
  const pagePermission: Record<string, string> = {
    overview: "analytics:view",
    inventory: "catalog:write",
    orders: "orders:view",
    activity: "catalog:write",
    prices: "catalog:write",
    variants: "catalog:write",
    returns: "orders:write",
    support: "support:write",
    targets: "analytics:view",
    recovery: "recovery:view",
    settings: "settings:write",
    staff: "staff:write",
  };
  const pageAllowed = (page: string) =>
    can(pagePermission[page] ?? "catalog:view");
  async function me() {
    const result = await json<{ role: Role; settings: Settings }>(
      "/store/growth/me",
    );
    role.value = result.role;
    store.value = result.settings;
    ready.value = true;
  }
  async function load(page: string) {
    if (!pageAllowed(page)) return;
    try {
      error.value = "";
      if (page === "settings") {
        const result = await json<{ settings: Settings; version: number }>(
          "/store/growth/settings",
        );
        Object.assign(form, result.settings);
        settingsVersion.value = result.version;
      }
      if (page === "targets") {
        targetData.value = await json("/store/growth/targets");
        for (const item of targetData.value.items)
          if (targetDraft[item.period] === undefined) { targetVersions[item.period]=item.version;
            targetDraft[item.period] =
              item.amount === null ? "" : String(item.amount); }
      }
      if (page === "support")
        support.value = (
          await json<{ items: Ticket[] }>("/store/growth/support")
        ).items;
      if (page === "staff") {
        const result = await json<{
          items: typeof staff.value;
          activity?: typeof activity.value;
        }>("/store/growth/staff");
        staff.value = result.items;
        activity.value = result.activity ?? [];
      }
      if (page === "recovery")
        recovery.value = await json("/store/growth/recovery");
    } catch (failure) {
      error.value = (failure as Error).message;
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
  const field = (key: keyof Settings, label: string, type = "text") =>
    h("label", { class: "field" }, [
      h("span", label),
      h(type === "textarea" ? "textarea" : "input", {
        type: type === "textarea" ? undefined : type,
        value: form[key],
        maxLength: 1000,
        onInput: (e: Event) => {
          const value = (e.target as HTMLInputElement).value;
          Object.assign(form, {
            [key]: type === "number" ? Number(value) : value,
          });
        },
      }),
    ]);
  function settingsPage() {
    return [
      h("section", { class: "growth-card" }, [
        h("h2", "Store settings"),
        h(
          "p",
          { class: "growth-muted" },
          "Store details appear in the shop. Payment and OTP secret keys stay outside these settings.",
        ),
        h("div", { class: "growth-grid" }, [
          field("name", "Store name"),
          field("tagline", "Tagline"),
          field("supportEmail", "Support email", "email"),
          field("supportPhone", "Support phone"),
          field("businessHours", "Business hours"),
          field("announcement", "Store announcement"),
        ]),
        field("returnPolicy", "Returns policy", "textarea"),
        h("h3", "Loyalty rules"),
        h("label", { class: "growth-check" }, [
          h("input", {
            type: "checkbox",
            checked: form.loyaltyEnabled,
            onChange: (e: Event) =>
              (form.loyaltyEnabled = (e.target as HTMLInputElement).checked),
          }),
          "Enable earning and redemption",
        ]),
        h("div", { class: "growth-grid" }, [
          field("loyaltyEarnEvery", "JPY spent to earn 1 point", "number"),
          field("loyaltyYenPerPoint", "JPY discount per point", "number"),
          field("loyaltyMaxPercent", "Maximum loyalty discount (%)", "number"),
        ]),
        h(
          "p",
          { class: "growth-muted" },
          "New rules apply to new orders. Existing order totals and earned-point rules are preserved. Points are earned only after payment; returns can reduce a points balance below zero until future earnings cover the adjustment.",
        ),
        h("div", { class: "growth-actions" }, [
          button("Reload settings", () => void load("settings"), busy.value),
          button(
            "Save settings",
            () =>
              void act(async () => {
                const result = await json<{
                  settings: Settings;
                  version: number;
                }>("/store/growth/settings", {
                  method: "PUT",
                  body: JSON.stringify({
                    settings: form,
                    version: settingsVersion.value,
                  }),
                });
                Object.assign(form, result.settings);
                settingsVersion.value = result.version;
                notify("Store settings saved.");
              }),
            busy.value,
          ),
        ]),
      ]),
    ];
  }
  function targetsPage() {
    return [
      h(
        "div",
        { class: "growth-grid" },
        targetData.value.items.map((item) => {
          const percent = item.amount
            ? Math.round((item.actual / item.amount) * 100)
            : 0;
          return h("section", { class: "growth-card" }, [
            h(
              "h2",
              item.period === "week"
                ? "Weekly sales target"
                : "Monthly sales target",
            ),
            h(
              "p",
              { class: "growth-muted" },
              `${item.startsOn} → ${item.endsOn} · JST`,
            ),
            h("strong", { class: "growth-metric" }, money(item.actual)),
            h("progress", {
              max: 100,
              value: Math.min(percent, 100),
              "aria-label":
                item.period === "week"
                  ? "Weekly target progress"
                  : "Monthly target progress",
            }),
            h(
              "p",
              item.amount
                ? `${percent}% · ${money(item.amount)} target`
                : "Set a target to track your progress.",
            ),
            can("targets:write")
              ? h("div", { class: "growth-actions" }, [
                  h("label", { class: "field" }, [
                    h("span", "Target amount (JPY)"),
                    h("input", {
                      type: "number",
                      min: 1,
                      max: 1000000000000,
                      step: 1,
                      value: targetDraft[item.period],
                      onInput: (e: Event) =>
                        (targetDraft[item.period] = (
                          e.target as HTMLInputElement
                        ).value),
                    }),
                  ]),
                  button(
                    "Save target",
                    () =>
                      void act(async () => {
                        targetData.value = await json("/store/growth/targets", {
                          method: "PUT",
                          body: JSON.stringify({
                            period: item.period,
                            amount: Number(targetDraft[item.period]),
                            version: targetVersions[item.period],
                          }),
                        });
                        for(const saved of targetData.value.items) {targetVersions[saved.period]=saved.version;targetDraft[saved.period]=saved.amount===null?"":String(saved.amount);}
                      notify("Sales target saved.");
                      }),
                    busy.value,
                  ),
                ])
              : null,
          ]);
        }),
      ),
      button("Reload targets",()=>{for(const key of Object.keys(targetDraft))delete targetDraft[key];void load("targets");},busy.value),
      h("p", { class: "growth-muted" }, targetData.value.note),
    ];
  }
  function supportPage() {
    const current = support.value.find((t) => t.id === selectedTicket.value);
    return [
      h("section", { class: "growth-card" }, [
        h("h2", "Customer support"),
        h(
          "p",
          { class: "growth-muted" },
          "Replies appear in the customer's support page. No email is sent automatically.",
        ),
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
                    replyStatus.value =
                      t.status === "resolved" ? "resolved" : "in_progress";
                  },
                },
                [
                  h("strong", t.subject),
                  h(
                    "small",
                    `${t.id.slice(0, 8).toUpperCase()} · ${date(t.updatedAt)}`,
                  ),
                ],
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
      ]),
      current
        ? h("section", { class: "growth-card" }, [
            h("h2", current.subject),
            current.orderId
              ? h("p", `Order: ${current.orderId.slice(0, 8).toUpperCase()}`)
              : null,
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
              h("span", "Reply to customer"),
              h("textarea", {
                value: reply.value,
                maxLength: 2000,
                onInput: (e: Event) =>
                  (reply.value = (e.target as HTMLTextAreaElement).value),
              }),
            ]),
            h("div", { class: "growth-actions" }, [
              h(
                "select",
                {
                  "aria-label": "Ticket status",
                  value: replyStatus.value,
                  onChange: (e: Event) =>
                    (replyStatus.value = (e.target as HTMLSelectElement).value),
                },
                ["open", "in_progress", "resolved"].map((value) =>
                  h("option", { value }, value.replaceAll("_", " ")),
                ),
              ),
              button(
                "Send reply",
                () =>
                  void act(async () => {
                    support.value = (
                      await json<{ items: Ticket[] }>(
                        `/store/growth/support/${current.id}/reply`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            message: reply.value,
                            status: replyStatus.value,
                          }),
                        },
                      )
                    ).items;
                    reply.value = "";
                    notify("Support reply saved.");
                  }),
                busy.value || !reply.value.trim(),
              ),
            ]),
          ])
        : null,
    ];
  }
  function staffPage() {
    return [
      h("section", { class: "growth-card" }, [
        h("h2", "Staff roles"),
        h(
          "p",
          { class: "growth-muted" },
          "Assign access to an existing Cognito username/email. This does not create a login account. Identity-provider administrators retain administrator access.",
        ),
        h("div", { class: "growth-actions" }, [
          h("label", { class: "field" }, [
            h("span", "Existing staff username"),
            h("input", {
              value: principal.value,
              maxLength: 254,
              onInput: (e: Event) =>
                (principal.value = (e.target as HTMLInputElement).value),
            }),
          ]),
          h(
            "select",
            {
              "aria-label": "Staff role",
              value: newRole.value,
              onChange: (e: Event) =>
                (newRole.value = (e.target as HTMLSelectElement).value),
            },
            ["manager", "inventory", "orders", "support", "disabled"].map(
              (value) => h("option", { value }, value),
            ),
          ),
          button(
            "Apply role",
            () =>
              void act(async () => {
                staff.value = (
                  await json<{ items: typeof staff.value }>(
                    "/store/growth/staff",
                    {
                      method: "PUT",
                      body: JSON.stringify({
                        principal: principal.value,
                        role: newRole.value,
                      }),
                    },
                  )
                ).items;
                principal.value = "";
                notify("Staff role updated.");
                await load("staff");
              }),
            busy.value || !principal.value.trim(),
          ),
        ]),
        h(
          "div",
          { class: "growth-list" },
          staff.value.map((person) =>
            h("div", { class: "growth-row" }, [
              h("strong", person.principal),
              h("span", { class: "growth-status" }, person.role),
            ]),
          ),
        ),
        h(
          "p",
          { class: "growth-muted" },
          "Manager: catalog, orders, refunds, analytics, support and targets. Inventory: products and stock. Orders: orders, returns and support; no refunds. Support: tickets and read-only orders. Disabled: no workspace access.",
        ),
      ]),
      h("section", { class: "growth-card" }, [
        h("h3", "Administration history"),
        ...activity.value.map((a) =>
          h(
            "p",
            `${date(a.createdAt)} · ${a.action.replaceAll("_", " ")} · ${a.actor.slice(0, 12)}`,
          ),
        ),
      ]),
    ];
  }
  function recoveryPage() {
    const data = recovery.value;
    return [
      h("section", { class: "growth-card" }, [
        h("h2", "Cart recovery"),
        h("p", { class: "growth-muted" }, data.note),
        h(
          "strong",
          { class: "growth-metric" },
          String(data.items.filter((i) => i.abandoned).length),
        ),
        h("p", "Inactive saved carts"),
        h(
          "div",
          { class: "growth-list" },
          data.items.map((item) =>
            h("div", { class: "growth-row" }, [
              h("div", [
                h("strong", `Customer ${item.customer}`),
                h("small", `${item.quantity} items · ${date(item.updatedAt)}`),
              ]),
              h("strong", money(item.value)),
              h(
                "span",
                { class: "growth-status" },
                item.abandoned ? "Abandoned" : "Recently active",
              ),
            ]),
          ),
        ),
        !data.items.length ? h("p", "No saved carts yet.") : null,
      ]),
    ];
  }
  function render(page: string) {
    return [
      h("div", { class: "growth-page" }, [
        error.value
          ? h("div", { class: "error-banner", role: "alert" }, error.value)
          : null,
        ...(page === "settings"
          ? settingsPage()
          : page === "targets"
            ? targetsPage()
            : page === "support"
              ? supportPage()
              : page === "staff"
                ? staffPage()
                : recoveryPage()),
      ]),
    ];
  }
  return { store, role, ready, form, can, pageAllowed, me, load, render };
}
