import { h, locale } from "../../../packages/ui/src/language.ts";
import type { Product } from "../../../packages/ui/src/storefront.ts";
export type StockReport = {
  days: number;
  current: number;
  incoming: number;
  outgoing: number;
  daily: Array<{
    day: string;
    incoming: number;
    outgoing: number;
    closing: number;
  }>;
  byProduct: Array<{ id: string; name: string; stock: number }>;
};
export function stockCharts(
  report: StockReport | null,
  products: Product[],
  productId: string,
  days: number,
  selectProduct: (id: string) => void,
  selectDays: (days: number) => void,
) {
  const daily = report?.daily ?? [],
    maxMovement = Math.max(
      1,
      ...daily.flatMap((d) => [d.incoming, d.outgoing]),
    ),
    maxStock = Math.max(1, ...daily.map((d) => d.closing));
  const width = 680,
    height = 200,
    pad = 30,
    plotW = width - pad * 2,
    plotH = height - pad * 2;
  const point = (d: (typeof daily)[number], i: number) => [
    pad + (daily.length <= 1 ? plotW / 2 : (i / (daily.length - 1)) * plotW),
    height - pad - (d.closing / maxStock) * plotH,
  ];
  const line = daily.map((d, i) => point(d, i).join(",")).join(" ");
  return h("section", { class: "stock-report card padded" }, [
    h("div", { class: "card-heading stock-report-heading" }, [
      h("div", [
        h("h2", "Stock in. Stock out. In balance."),
        h(
          "p",
          { class: "muted" },
          "Current quantities and recorded inventory movements, updated automatically.",
        ),
      ]),
      h("div", { class: "stock-chart-filters" }, [
        h(
          "select",
          {
            "aria-label": "Select product for stock chart",
            value: productId,
            onChange: (e: Event) =>
              selectProduct((e.target as HTMLSelectElement).value),
          },
          [
            h("option", { value: "" }, "All products"),
            ...products.map((p) => h("option", { value: p.id }, p.name)),
          ],
        ),
        h(
          "select",
          {
            "aria-label": "Stock chart period",
            value: String(days),
            onChange: (e: Event) =>
              selectDays(Number((e.target as HTMLSelectElement).value)),
          },
          [
            h("option", { value: "7" }, "Last 7 days"),
            h("option", { value: "30" }, "Last 30 days"),
          ],
        ),
      ]),
    ]),
    h(
      "div",
      { class: "stock-chart-totals" },
      [
        ["Available now", report?.current ?? 0, "current"],
        ["Stock added", report?.incoming ?? 0, "incoming"],
        ["Stock removed / reserved", report?.outgoing ?? 0, "outgoing"],
      ].map(([label, n, kind]) =>
        h("div", { class: String(kind) }, [
          h("span", String(label)),
          h("strong", Number(n).toLocaleString(locale())),
        ]),
      ),
    ),
    h("div", { class: "stock-chart-grid" }, [
      h("div", { class: "movement-chart" }, [
        h("h3", "Units added and removed"),
        h("div", { class: "chart-legend" }, [
          h("span", { class: "legend-in" }, "Stock in"),
          h("span", { class: "legend-out" }, "Stock out"),
        ]),
        h(
          "div",
          {
            class: days === 30 ? "movement-bars compact" : "movement-bars",
            role: "img",
            "aria-label": daily
              .map(
                (d) => `${d.day}: ${d.incoming} added, ${d.outgoing} removed`,
              )
              .join("; "),
          },
          daily.map((d, i) =>
            h(
              "div",
              {
                class: "movement-day",
                title: `${d.day}: +${d.incoming} / −${d.outgoing}`,
              },
              [
                h("div", { class: "movement-pair" }, [
                  h(
                    "div",
                    {
                      class: "movement-in",
                      style: { height: `${(d.incoming / maxMovement) * 100}%` },
                    },
                    d.incoming && days === 7 ? String(d.incoming) : "",
                  ),
                  h(
                    "div",
                    {
                      class: "movement-out",
                      style: { height: `${(d.outgoing / maxMovement) * 100}%` },
                    },
                    d.outgoing && days === 7 ? String(d.outgoing) : "",
                  ),
                ]),
                h("small", days === 7 || i % 5 === 0 ? d.day.slice(5) : ""),
              ],
            ),
          ),
        ),
      ]),
      h("div", { class: "closing-chart" }, [
        h("h3", "Closing stock trend"),
        h(
          "svg",
          {
            viewBox: `0 0 ${width} ${height}`,
            role: "img",
            "aria-label": daily
              .map((d) => `${d.day}: ${d.closing} closing units`)
              .join("; "),
          },
          [
            h("line", {
              x1: pad,
              y1: height - pad,
              x2: width - pad,
              y2: height - pad,
              stroke: "#e3e9de",
            }),
            h("line", {
              x1: pad,
              y1: pad,
              x2: width - pad,
              y2: pad,
              stroke: "#edf1e8",
              "stroke-dasharray": "4 4",
            }),
            h(
              "text",
              { x: 3, y: height - pad + 4, fill: "#7d8d72", "font-size": 10 },
              "0",
            ),
            h(
              "text",
              { x: 3, y: pad + 4, fill: "#7d8d72", "font-size": 10 },
              String(maxStock),
            ),
            line
              ? h("polygon", {
                  points: `${pad},${height - pad} ${line} ${width - pad},${height - pad}`,
                  fill: "#edf4e7",
                })
              : null,
            h("polyline", {
              points: line,
              fill: "none",
              stroke: "#64884d",
              "stroke-width": 3,
              "stroke-linejoin": "round",
              "stroke-linecap": "round",
            }),
            ...daily
              .filter((_, i) => days === 7 || i % 5 === 0)
              .map((d) => {
                const i = daily.indexOf(d),
                  [x, y] = point(d, i);
                return h("g", [
                  h("circle", { cx: x, cy: y, r: 3.5, fill: "#64884d" }, [
                    h("title", `${d.day}: ${d.closing} units`),
                  ]),
                  h(
                    "text",
                    {
                      x,
                      y: height - 7,
                      "text-anchor": "middle",
                      fill: "#7d8d72",
                      "font-size": 10,
                    },
                    d.day.slice(5),
                  ),
                ]);
              }),
          ],
        ),
        h(
          "p",
          { class: "fine-print" },
          "Trend reconstructed from recorded changes. Earlier history may be incomplete.",
        ),
      ]),
    ]),
    h("div", { class: "stock-ranking" }, [
      h(
        "h3",
        productId
          ? "Current stock for this product"
          : "Current stock by product · top 12",
      ),
      ...(report?.byProduct ?? []).map((p) =>
        h("div", { class: "stock-rank-row" }, [
          h("span", p.name),
          h("div", { class: "stock-rank-track" }, [
            h("i", {
              style: {
                width: `${(p.stock / Math.max(1, ...(report?.byProduct ?? []).map((p) => p.stock))) * 100}%`,
              },
            }),
          ]),
          h("strong", String(p.stock)),
        ]),
      ),
    ]),
  ]);
}
