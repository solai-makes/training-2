import { t } from "../../../packages/ui/src/language.ts";
import { imagePdf } from "../../../packages/ui/src/pdf.ts";
import { money } from "../../../packages/ui/src/storefront.ts";
import type { SalesReport } from "./sales-dashboard.ts";

/** A fixed A4 dashboard layout. Charts and labels are rendered at 3× print size. */
export async function createStatsPdf(report: SalesReport): Promise<Blob> {
  await document.fonts.ready;
  const r = report,
    pages: HTMLCanvasElement[] = [],
    W = 595,
    H = 842,
    S = 3;
  const c = {
    ink: "#183d32",
    muted: "#687e76",
    green: "#28775d",
    mint: "#eaf3ed",
    gold: "#dea53d",
    goldLight: "#fcf3de",
    red: "#bf6450",
    line: "#dde7e0",
    paper: "#f4f7f3",
    white: "#ffffff",
    navy: "#183b32",
  };
  let ctx!: CanvasRenderingContext2D;
  const text = (
    value: string,
    x: number,
    y: number,
    size = 10,
    color = c.ink,
    bold = false,
    align: CanvasTextAlign = "left",
  ) => {
    ctx.font = `${bold ? 700 : 400} ${size}px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  };
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    radius = 0,
    stroke?: string,
  ) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
  };
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color = c.line,
    width = 0.7,
  ) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  const fit = (value: string, width: number, size = 10, bold = false) => {
    ctx.font = `${bold ? 700 : 400} ${size}px system-ui, sans-serif`;
    if (ctx.measureText(value).width <= width) return value;
    let out = value;
    while (out.length && ctx.measureText(`${out}…`).width > width)
      out = out.slice(0, -1);
    return `${out}…`;
  };
  const wrap = (value: string, width: number, size = 9) => {
    ctx.font = `400 ${size}px system-ui, sans-serif`;
    const rows: string[] = [];
    let row = "";
    for (const word of value.split(/\s+/)) {
      const next = row ? `${row} ${word}` : word;
      if (ctx.measureText(next).width > width && row) {
        rows.push(row);
        row = word;
      } else row = next;
    }
    if (row) rows.push(row);
    return rows;
  };
  const paragraph = (
    value: string,
    x: number,
    y: number,
    width: number,
    size = 9,
    color = c.muted,
    leading = 13,
    maxLines = 99,
  ) => {
    const rows = wrap(value, width, size);
    rows.slice(0, maxLines).forEach((row, i) => {
      text(row, x, y + i * leading, size, color);
    });
    return rows.length * leading;
  };
  const date = (value: string, year = false) =>
    new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      ...(year ? { year: "numeric" } : {}),
    });
  const num = (value: number) => new Intl.NumberFormat("en-GB").format(value);
  const compact = (value: number) =>
    value >= 1000000
      ? `¥${(value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1)}m`
      : value >= 1000
        ? `¥${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
        : money(value);
  const maxDaily = Math.max(0, ...r.daily.map((d) => d.revenue)),
    peak = r.daily.find((d) => d.revenue === maxDaily && maxDaily > 0),
    active = r.daily.filter((d) => d.orders > 0).length;
  const period = `${date(r.from)} — ${date(r.to, true)}`;
  function page(index: number, title: string, subtitle: string, dark = false) {
    const canvas = document.createElement("canvas");
    canvas.width = W * S;
    canvas.height = H * S;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create the PDF drawing canvas.");
    ctx = context;
    ctx.scale(S, S);
    pages.push(canvas);
    rect(0, 0, W, H, c.paper);
    if (dark) rect(0, 0, W, 108, c.navy);
    else rect(0, 0, W, 4, c.green);
    rect(32, 22, 22, 22, dark ? c.gold : c.green, 6);
    text("S", 43, 38, 15, dark ? c.navy : c.white, true, "center");
    text("solaistore.", 64, 39, 17, dark ? c.white : c.ink, true);
    text(
      `OPERATIONS REPORT / 0${index}`,
      563,
      36,
      8,
      dark ? "#c4d6ca" : c.muted,
      true,
      "right",
    );
    text(title, 32, 77, 25, dark ? c.white : c.ink, true);
    text(subtitle, 32, 95, 9, dark ? "#cbdbd1" : c.muted);
    line(32, 797, 563, 797);
    text(`SOLAISTORE  /  JPY  /  ${period}`, 32, 812, 7.3, c.muted);
    text(`${index} / 3`, 563, 812, 8, c.muted, true, "right");
    text(
      `Generated ${new Date(r.generatedAt).toLocaleString("en-GB")} · Demo sales are fictional; no money was charged.`,
      32,
      825,
      7,
      c.muted,
    );
  }
  function panel(
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    subtitle?: string,
  ) {
    rect(x, y, w, h, c.white, 12, c.line);
    text(title, x + 16, y + 25, 11, c.ink, true);
    if (subtitle) text(fit(subtitle, w - 32, 8), x + 16, y + 40, 8, c.muted);
  }
  function kpi(
    x: number,
    y: number,
    label: string,
    value: string,
    note: string,
    accent = false,
  ) {
    rect(x, y, 259.5, 78, accent ? c.mint : c.white, 11, c.line);
    rect(x + 15, y + 16, 3, 43, accent ? c.green : c.gold, 1);
    text(fit(t(label), 220, 8.5, true), x + 28, y + 23, 8.5, c.muted, true);
    text(fit(value, 220, 24, true), x + 28, y + 49, 24, c.ink, true);
    text(fit(note, 220, 8), x + 28, y + 66, 8, c.muted);
  }
  function revenueChart() {
    panel(
      32,
      310,
      531,
      270,
      t("Revenue trend"),
      "Daily confirmed order value · JPY · Includes demo orders and COD due",
    );
    if (peak) {
      rect(409, 322, 138, 26, c.goldLight, 6);
      text(`PEAK  ${money(peak.revenue)}`, 478, 339, 9, c.ink, true, "center");
    }
    const x = 82,
      y = 379,
      w = 465,
      h = 137;
    // Round to a readable currency scale; never normalize away zero-value days.
    const raw = Math.max(maxDaily, 4),
      power = 10 ** Math.floor(Math.log10(raw)),
      top = Math.ceil(raw / (power / 2)) * (power / 2);
    for (let i = 0; i <= 4; i++) {
      const v = (top * i) / 4,
        yy = y + h - (h * i) / 4;
      line(x, yy, x + w, yy);
      text(compact(v), x - 10, yy + 3, 8, c.muted, false, "right");
    }
    const step = w / Math.max(1, r.daily.length),
      barW = Math.max(2, Math.min(32, step * 0.64));
    r.daily.forEach((d, i) => {
      const bx = x + step * i + (step - barW) / 2,
        bh = (d.revenue / top) * h;
      if (bh > 0)
        rect(
          bx,
          y + h - bh,
          barW,
          bh,
          d === peak ? c.gold : c.green,
          Math.min(2, bh / 2),
        );
      else line(bx, y + h, bx + barW, y + h, "#becfc3", 1.5);
    });
    const ticks = [
      ...new Set([
        0,
        Math.round((r.daily.length - 1) * 0.25),
        Math.round((r.daily.length - 1) * 0.5),
        Math.round((r.daily.length - 1) * 0.75),
        r.daily.length - 1,
      ]),
    ];
    ticks.forEach((i) => {
      if (r.daily[i])
        text(
          date(r.daily[i].day),
          x + step * (i + 0.5),
          535,
          8,
          c.muted,
          false,
          "center",
        );
    });
    line(48, 548, 547, 548);
    text(`${active} of ${r.days} days with orders`, 48, 566, 9, c.ink, true);
    text(
      peak
        ? `Peak day: ${date(peak.day)} · ${peak.orders} orders`
        : "No confirmed orders in this period",
      547,
      566,
      9,
      c.muted,
      false,
      "right",
    );
  }
  function donut() {
    panel(
      32,
      596,
      259.5,
      186,
      t("Sales mix"),
      "Share of confirmed order value",
    );
    const cx = 104,
      cy = 694,
      radius = 42,
      share =
        r.revenue > 0 ? Math.max(0, Math.min(1, r.demoRevenue / r.revenue)) : 0;
    ctx.lineWidth = 14;
    ctx.strokeStyle = c.line;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();
    if (r.revenue > 0) {
      ctx.strokeStyle = c.green;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, -Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      if (share > 0) {
        ctx.strokeStyle = c.gold;
        ctx.beginPath();
        ctx.arc(
          cx,
          cy,
          radius,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * share,
        );
        ctx.stroke();
      }
    }
    text(
      r.revenue > 0 ? `${Math.round(share * 100)}%` : "—",
      cx,
      cy + 3,
      23,
      c.ink,
      true,
      "center",
    );
    text("DEMO SHARE", cx, cy + 18, 6.5, c.muted, true, "center");
    for (const [i, label, value, color] of [
      [0, t("Demo sales"), r.demoRevenue, c.gold],
      [1, t("Other sales"), Math.max(0, r.revenue - r.demoRevenue), c.green],
    ] as const) {
      const yy = 671 + i * 44;
      rect(169, yy - 7, 6, 6, color, 2);
      text(fit(label, 98, 8), 181, yy, 8, c.muted);
      text(money(value), 169, yy + 18, 12, c.ink, true);
    }
    text("Order value ≠ cash collected", 48, 766, 8, c.muted);
  }
  function flow() {
    panel(
      307.5,
      596,
      255.5,
      186,
      "Inventory movement",
      "Recorded changes during the selected period",
    );
    const incoming = r.stockIncoming ?? 0,
      outgoing = r.stockOutgoing ?? 0,
      max = Math.max(1, incoming, outgoing);
    [
      [t("Stock incoming"), incoming, c.green],
      [t("Stock outgoing"), outgoing, c.red],
    ].forEach(([label, value, color], i) => {
      const yy = 656 + i * 43;
      text(String(label), 324, yy, 9, c.muted);
      text(num(Number(value)), 547, yy, 11, c.ink, true, "right");
      rect(324, yy + 9, 223, 8, c.paper, 4);
      if (Number(value) > 0)
        rect(
          324,
          yy + 9,
          Math.max(3, (223 * Number(value)) / max),
          8,
          String(color),
          4,
        );
    });
    text("Includes new-stock setup and reservations.", 324, 754, 7.4, c.muted);
    text("Not a supplier purchase-cost measure.", 324, 767, 7.4, c.muted);
  }

  page(
    1,
    "Sales & stock, at a glance.",
    `${period}  ·  ${r.days}-day snapshot`,
    true,
  );
  kpi(
    32,
    124,
    "Sales revenue",
    money(r.revenue),
    "Confirmed order value · includes tax",
    true,
  );
  kpi(
    303.5,
    124,
    "Orders placed",
    num(r.orders),
    `${num(r.unitsSold)} units sold · average ${money(r.orders ? r.revenue / r.orders : 0)}`,
  );
  kpi(
    32,
    214,
    "Current stock",
    num(r.currentStock),
    `${num(r.productCount)} products · retail value ${compact(r.retailValue)}`,
  );
  kpi(
    303.5,
    214,
    "vs previous period",
    r.changePercent === null
      ? "—"
      : `${(r.changePercent > 0 ? "+" : "") + r.changePercent}%`,
    r.changePercent === null
      ? "No previous sales to compare"
      : `Previous ${r.days} days: ${money(r.previousRevenue)}`,
  );
  revenueChart();
  donut();
  flow();

  page(
    2,
    "What is moving. What needs care.",
    `Product performance · ${period} · Item values exclude tax`,
  );
  panel(
    32,
    116,
    531,
    297,
    t("Best sellers"),
    "Ranked by item value in currently confirmed orders",
  );
  const maxBest = Math.max(1, ...r.best.map((p) => p.revenue));
  if (!r.best.length)
    paragraph(
      "No confirmed product sales yet. This chart fills as orders are confirmed.",
      48,
      183,
      470,
      11,
    );
  r.best.slice(0, 8).forEach((p, i) => {
    const yy = 174 + i * 27;
    rect(48, yy - 9, 17, 17, i === 0 ? c.goldLight : c.mint, 5);
    text(String(i + 1), 56.5, yy + 3, 8, c.ink, true, "center");
    text(fit(p.name, 330, 9, true), 75, yy, 9, c.ink, true);
    text(money(p.revenue), 547, yy, 10, c.ink, true, "right");
    rect(75, yy + 7, 379, 5, c.paper, 2);
    if (p.revenue > 0)
      rect(
        75,
        yy + 7,
        (379 * p.revenue) / maxBest,
        5,
        i === 0 ? c.gold : c.green,
        2,
      );
    text(`${num(p.units)} units`, 547, yy + 12, 7.5, c.muted, false, "right");
  });
  panel(
    32,
    429,
    259.5,
    353,
    t("Slow movers"),
    "Lowest units sold, then highest available stock",
  );
  const maxSlow = Math.max(1, ...r.slow.map((p) => p.stock));
  if (!r.slow.length)
    paragraph("No in-stock products to review.", 48, 493, 225, 10);
  r.slow.slice(0, 8).forEach((p, i) => {
    const yy = 487 + i * 34;
    text(fit(p.name, 226, 8.3, true), 48, yy, 8.3, c.ink, true);
    text(
      `${num(p.units)} sold  /  ${num(p.stock)} in stock`,
      48,
      yy + 12,
      7.5,
      c.muted,
    );
    rect(48, yy + 18, 226, 4, c.paper, 2);
    if (p.stock > 0)
      rect(48, yy + 18, (226 * p.stock) / maxSlow, 4, "#8bac98", 2);
  });
  text("Review demand before replenishing.", 48, 769, 7.5, c.muted);
  panel(
    307.5,
    429,
    255.5,
    353,
    t("Low-stock alerts"),
    "Five units or fewer · lowest stock first",
  );
  if (!r.low.length) {
    rect(324, 488, 223, 48, c.mint, 8);
    text("ALL CLEAR", 336, 509, 10, c.green, true);
    text("No low-stock products in this snapshot.", 336, 524, 8, c.muted);
  }
  r.low.slice(0, 12).forEach((p, i) => {
    const yy = 487 + i * 22;
    if (i % 2 === 0) rect(318, yy - 11, 234, 22, c.paper, 3);
    text(fit(p.name, 187, 8), 324, yy + 3, 8, c.ink);
    rect(519, yy - 8, 28, 16, p.stock === 0 ? "#f8e7e0" : c.goldLight, 5);
    text(
      String(p.stock),
      533,
      yy + 3,
      8.5,
      p.stock === 0 ? c.red : c.ink,
      true,
      "center",
    );
  });
  text(
    "Stock counts are current, not period averages.",
    324,
    769,
    7.3,
    c.muted,
  );

  page(
    3,
    "The figures behind the view.",
    `Daily ledger · ${period} · Values in JPY`,
  );
  const yHeader = 120,
    rowH = r.daily.length > 15 ? 16 : 26;
  rect(32, yHeader, 531, 30, c.navy, 7);
  text("DATE", 48, 140, 8, c.white, true);
  text("ORDERS", 292, 140, 8, c.white, true, "right");
  text("ORDER VALUE", 432, 140, 8, c.white, true, "right");
  text("PERIOD SHARE", 547, 140, 8, c.white, true, "right");
  r.daily.forEach((d, i) => {
    const y = 150 + i * rowH;
    if (i % 2 === 0) rect(32, y, 531, rowH, c.white);
    const baseline = y + rowH * 0.69;
    text(date(d.day, true), 48, baseline, 8.5, c.ink);
    text(num(d.orders), 292, baseline, 8.5, c.ink, false, "right");
    text(
      money(d.revenue),
      432,
      baseline,
      8.5,
      d === peak ? c.green : c.ink,
      d === peak,
      "right",
    );
    text(
      `${(r.revenue ? (d.revenue / r.revenue) * 100 : 0).toFixed(1)}%`,
      547,
      baseline,
      8,
      c.muted,
      false,
      "right",
    );
  });
  const totalY = 150 + r.daily.length * rowH;
  rect(32, totalY, 531, 29, c.mint, 6);
  text("PERIOD TOTAL", 48, totalY + 19, 8.5, c.ink, true);
  text(num(r.orders), 292, totalY + 19, 9, c.ink, true, "right");
  text(money(r.revenue), 432, totalY + 19, 10, c.ink, true, "right");
  text(
    r.revenue ? "100.0%" : "0.0%",
    547,
    totalY + 19,
    8.5,
    c.ink,
    true,
    "right",
  );
  const notesY = totalY + 48;
  text("HOW TO READ THIS REPORT", 32, notesY, 9, c.ink, true);
  const definitions = [
    "Sales: JPY value of currently confirmed orders with saved receipt snapshots, including tax. Cancelled and refunded orders are excluded.",
    `Payment context: demo orders ${money(r.demoRevenue)}; unpaid COD ${money(r.dueRevenue)}. These totals are not verified cash receipts.`,
    "Comparison: previous equal-length period. The current day is partial. Product ranks use item value before tax. Dates follow the database timezone.",
    "Inventory: current quantities and recorded movements. Stock value uses retail prices. Purchase costs, margins and profit are not available.",
  ];
  let noteY = notesY + 17;
  definitions.forEach((value) => {
    noteY += paragraph(value, 32, noteY, 531, 7.8, c.muted, 11) + 5;
  });
  // Every page is exported as a high-resolution image inside a real A4 PDF.
  const images = pages.map((canvas) => ({
    width: canvas.width,
    height: canvas.height,
    bytes: Uint8Array.from(
      atob(canvas.toDataURL("image/jpeg", 0.95).split(",")[1]),
      (character) => character.charCodeAt(0),
    ),
  }));
  return new Blob([imagePdf(images) as BlobPart], { type: "application/pdf" });
}
