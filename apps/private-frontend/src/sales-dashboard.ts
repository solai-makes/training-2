import {RevenueChart} from "./revenue-chart.ts";
import {AnimatedNumber} from "../../../packages/ui/src/animated-number.ts";
import { h, t, locale } from "../../../packages/ui/src/language.ts";
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
  days: number | "custom",
  setDays: (days: number | "custom") => void,
  onError: (message: string) => void,
  controls?:{from:string;to:string;loading:boolean;onFrom:(value:string)=>void;onTo:(value:string)=>void;onApply:()=>void;onClear?:()=>void},
) {
  if (!report)
    return h("section", { class: "card sales-dashboard" }, [
      h("h2", "Inventory dashboard"),
      h("p", "Loading…"),
    ]);
  const r=report;
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
              setDays((e.target as HTMLSelectElement).value==="custom"?"custom":Number((e.target as HTMLSelectElement).value)),
          },
          [
            h("option", { value: 7 }, "7 days"),
            h("option", { value: 15 }, "15 days"),
            h("option", { value: 30 }, "30 days"),
            h("option", { value: "custom" }, "Custom dates"),
          ],
        ),
        h(
          "button",
          {
            class: "btn primary",
            type: "button",
            disabled:controls?.loading,
            onClick: () =>
              void downloadStats(r).catch((e) => onError(e.message)),
          },
          "Download stats PDF",
        ),
      ]),
    ]),
    days==='custom'&&controls?h('form',{class:'analytics-custom-dates',onSubmit:(event:Event)=>{event.preventDefault();controls.onApply();}},[
      h('label',[h('span','Start date'),h('input',{type:'date',value:controls.from,required:true,'aria-label':'Start date',onInput:(e:Event)=>controls.onFrom((e.target as HTMLInputElement).value)})]),
      h('label',[h('span','End date'),h('input',{type:'date',value:controls.to,min:controls.from||undefined,required:true,'aria-label':'End date',onInput:(e:Event)=>controls.onTo((e.target as HTMLInputElement).value)})]),
      h('button',{type:'submit',class:'btn primary',disabled:controls.loading},controls.loading?'Loading…':'Apply dates'),h('button',{type:'button',class:'btn secondary',disabled:controls.loading,onClick:()=>controls.onClear?.()},'Clear dates'),h('small','Choose up to 366 days. Both dates are included.')
    ]):null,
    controls?.loading?h('p',{role:'status',class:'muted'},'Updating report…'):null,
    h(
      "div",
      { class: "analytics-kpis" },
      [
        ["Sales revenue", r.revenue, trend(r)],
        [
          "Orders placed",
          r.orders,
          `${r.unitsSold} ${t("Units sold")}`,
        ],
        [
          "Current stock",
          r.currentStock,
          `${r.productCount} ${t("Products")}`,
        ],
        [
          "Stock retail value",
          r.retailValue,
          "Retail price × current stock",
        ],
      ].map(([label, value, description], index) =>
        h("article", { key:String(label), class: "card analytics-kpi", style:{"--kpi-delay":`${index*80}ms`} }, [
          h("span", label),
          h(AnimatedNumber, {value:Number(value), format:label==="Sales revenue"||label==="Stock retail value"?"money":"number", delay:index*80}),
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
        h("p",{class:"fine-print"},"Hover, tap or focus a point to see daily sales."),
        h(RevenueChart,{key:r.from+":"+r.to,daily:r.daily,from:r.from,to:r.to}),
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
      h("section", { class: "card analytics-panel sales-mix-panel" }, [
        h("h3", "Sales mix"),
        h("div", { class: "sales-mix-total" }, [
          h("small", "Total sales"),
          h(AnimatedNumber, {value:r.revenue,format:"money"}),
        ]),
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
              h(AnimatedNumber, {value:r.revenue?r.demoRevenue/r.revenue:0,format:"percent"}),
              h("small", "Demo share"),
            ]),
          ],
        ),
        h(
          "div",
          { class: "sales-mix-legend" },
          [
            ["Demo sales", r.demoRevenue, "demo"],
            ["Other sales", r.revenue - r.demoRevenue, ""],
          ].map(([label, value, tone]) =>
            h("div", [
              h("i", { class: `legend-dot ${tone}` }),
              h("span", String(label)),
              h("b", money(Number(value))),
            ]),
          ),
        ),
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
