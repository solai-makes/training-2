import { h, t } from "../../../packages/ui/src/language.ts";
import { money } from "../../../packages/ui/src/storefront.ts";
import { createStatsPdf } from "./stats-pdf.ts";

export { createStatsPdf } from "./stats-pdf.ts";
export type SalesReport = {
  stockIncoming: number;
  stockOutgoing: number;
  days: number;
  from: string;
  to: string;
  generatedAt: string;
  revenue: number;
  previousRevenue: number;
  changePercent: number | null;
  orders: number;
  unitsSold: number;
  demoRevenue: number;
  dueRevenue: number;
  productCount: number;
  currentStock: number;
  retailValue: number;
  daily: Array<{ day: string; revenue: number; orders: number }>;
  best: Array<{ id: string; name: string; units: number; revenue: number }>;
  slow: Array<{ id: string; name: string; stock: number; units: number }>;
  low: Array<{ id: string; name: string; stock: number }>;
  notes: string;
};
const trend = (r: SalesReport) =>
  r.changePercent === null
    ? t("No previous sales to compare")
    : r.changePercent === 0
      ? t("Same as previous period")
      : (r.changePercent > 0 ? "↑ +" : "↓ ") +
        r.changePercent +
        "% " +
        t("vs previous period");
export function salesDashboard(
  report: SalesReport | null,
  days: number,
  setDays: (days: number) => void,
  onError: (message: string) => void,
) {
  if (!report)
    return h("section", { class: "card sales-dashboard" }, [
      h("h2", "Inventory dashboard"),
      h("p", "Loading…"),
    ]);
  const r = report,
    max = Math.max(1, ...r.daily.map((d) => d.revenue)),
    points = r.daily
      .map(
        (d, i) =>
          `${24 + (i * 632) / (r.daily.length - 1)},${178 - (d.revenue / max) * 145}`,
      )
      .join(" ");
  type RankingRow = {
    id: string;
    name: string;
    units?: number;
    stock?: number;
    revenue?: number;
  };
  const list = (
    title: string,
    rows: RankingRow[],
    mode: "best" | "slow" | "low",
  ) =>
    h("section", { class: "card analytics-panel" }, [
      h("h3", title),
      rows.length
        ? h(
            "ol",
            { class: "analytics-ranking" },
            rows.map((row, i) =>
              h("li", { key: row.id }, [
                h("span", { class: "rank-number" }, String(i + 1)),
                h("span", { class: "rank-name" }, [
                  h("strong", row.name),
                  h(
                    "small",
                    mode === "best"
                      ? `${row.units} ${t("Units sold")}`
                      : mode === "slow"
                        ? `${row.units} ${t("Units sold")} · ${row.stock} ${t("Current stock")}`
                        : `${row.stock} ${t("Current stock")}`,
                  ),
                ]),
                mode === "best"
                  ? h("b", money(row.revenue ?? 0))
                  : h(
                      "span",
                      { class: `badge ${mode === "low" ? "low" : ""}` },
                      mode === "low" ? "Restock" : "Review",
                    ),
              ]),
            ),
          )
        : h(
            "p",
            { class: "muted" },
            mode === "low" ? "All clear" : "No sales yet",
          ),
    ]);
  return h("section", { class: "sales-dashboard" }, [
    h("div", { class: "analytics-heading" }, [
      h("div", [
        h("span", { class: "eyebrow" }, "Sales & inventory intelligence"),
        h("h2", "Inventory dashboard"),
        h(
          "p",
          { class: "muted" },
          `${r.from} → ${r.to} · JPY · ${t("Auto-refresh every 4 seconds")}`,
        ),
      ]),
      h("div", { class: "analytics-actions" }, [
        h(
          "select",
          {
            "aria-label": "Reporting period",
            value: days,
            onChange: (e: Event) =>
              setDays(Number((e.target as HTMLSelectElement).value)),
          },
          [
            h("option", { value: 7 }, "7 days"),
            h("option", { value: 30 }, "30 days"),
          ],
        ),
        h(
          "button",
          {
            class: "btn primary",
            type: "button",
            onClick: () =>
              void downloadStats(r).catch((e) => onError(e.message)),
          },
          "Download stats PDF",
        ),
      ]),
    ]),
    h(
      "div",
      { class: "analytics-kpis" },
      [
        ["Sales revenue", money(r.revenue), trend(r)],
        [
          "Orders placed",
          String(r.orders),
          `${r.unitsSold} ${t("Units sold")}`,
        ],
        [
          "Current stock",
          String(r.currentStock),
          `${r.productCount} ${t("Products")}`,
        ],
        [
          "Stock retail value",
          money(r.retailValue),
          "Retail price × current stock",
        ],
      ].map(([label, value, description]) =>
        h("article", { class: "card analytics-kpi" }, [
          h("span", label),
          h("strong", { key: value, class: "animated-value" }, value),
          h(
            "small",
            {
              class:
                label === "Sales revenue"
                  ? (r.changePercent ?? 0) < 0
                    ? "trend-down"
                    : "trend-up"
                  : "",
            },
            description,
          ),
        ]),
      ),
    ),
    h("div", { class: "analytics-main" }, [
      h("section", { class: "card analytics-panel" }, [
        h("h3", "Revenue trend"),
        h("p", { class: "muted" }, "Confirmed order value · JPY"),
        h(
          "svg",
          {
            class: "revenue-chart",
            viewBox: "0 0 680 220",
            role: "img",
            "aria-label": "Revenue trend",
          },
          [
            ...Array.from({ length: 4 }, (_, i) =>
              h("g", [
                h("line", {
                  x1: 24,
                  x2: 656,
                  y1: 33 + i * 48,
                  y2: 33 + i * 48,
                  stroke: "#e3eae4",
                }),
                h(
                  "text",
                  { x: 24, y: 25 + i * 48, fill: "#677a6d", "font-size": 11 },
                  money(Math.round(max * (1 - i / 3))),
                ),
              ]),
            ),
            h("polygon", {
              points: `24,178 ${points} 656,178`,
              fill: "#ddeede",
            }),
            h("polyline", {
              points,
              fill: "none",
              stroke: "#397c52",
              "stroke-width": 4,
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              class: "revenue-line",
            }),
            ...r.daily.map((d, i) =>
              h(
                "circle",
                {
                  cx: 24 + (i * 632) / (r.daily.length - 1),
                  cy: 178 - (d.revenue / max) * 145,
                  r: 4,
                  fill: "#397c52",
                },
                [
                  h(
                    "title",
                    d.day +
                      ": " +
                      money(d.revenue) +
                      " · " +
                      d.orders +
                      " " +
                      t("Orders"),
                  ),
                ],
              ),
            ),
            h(
              "text",
              { x: 24, y: 210, "font-size": 13, fill: "#677a6d" },
              r.from,
            ),
            h(
              "text",
              {
                x: 656,
                y: 210,
                "text-anchor": "end",
                "font-size": 13,
                fill: "#677a6d",
              },
              r.to,
            ),
          ],
        ),
        h("details", [
          h("summary", "Daily figures"),
          h("div", { class: "analytics-table-scroll" }, [
            h("table", [
              h("thead", [
                h(
                  "tr",
                  ["Date", "Orders", "Sales revenue"].map((label) =>
                    h("th", label),
                  ),
                ),
              ]),
              h(
                "tbody",
                r.daily.map((d) =>
                  h("tr", [
                    h("td", d.day),
                    h("td", d.orders),
                    h("td", money(d.revenue)),
                  ]),
                ),
              ),
            ]),
          ]),
        ]),
      ]),
      h("section", { class: "card analytics-panel" }, [
        h("h3", "Sales mix"),
        h(
          "div",
          {
            class: "sales-donut",
            style: {
              background:
                "conic-gradient(#e4ac45 0 " +
                (r.revenue ? (r.demoRevenue / r.revenue) * 100 : 0) +
                "%,#397c52 0 100%)",
            },
          },
          [
            h("div", [
              h("strong", money(r.revenue)),
              h("small", "Sales revenue"),
            ]),
          ],
        ),
        h("p", [
          h("i", { class: "legend-dot demo" }),
          "Demo sales",
          h("b", money(r.demoRevenue)),
        ]),
        h("p", [
          h("i", { class: "legend-dot" }),
          "Other sales",
          h("b", money(r.revenue - r.demoRevenue)),
        ]),
        h(
          "p",
          { class: "fine-print" },
          "COD due: " +
            money(r.dueRevenue) +
            ". Order value includes unpaid COD; it is not cash collected.",
        ),
      ]),
    ]),
    h("div", { class: "analytics-lists" }, [
      list("Best sellers", r.best, "best"),
      list("Slow movers", r.slow, "slow"),
      list("Low-stock alerts", r.low, "low"),
    ]),
    h("p", { class: "fine-print analytics-notes" }, r.notes),
  ]);
}
export async function downloadStats(r: SalesReport) {
  const blob = await createStatsPdf(r),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `solaistore-stats-${r.from}-${r.to}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
