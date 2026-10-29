import type { Receipt } from "../../../packages/ui/src/storefront.ts";
import { date, money } from "../../../packages/ui/src/storefront.ts";

// Browser-rendered text preserves Unicode product names and addresses without
// downloading fonts. Each raster page is embedded in a real PDF document.
export function imagePdf(
  images: Array<{ bytes: Uint8Array; width: number; height: number }>,
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const offsets: number[] = [0];
  const write = (value: string | Uint8Array) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    size += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = size;
    write(`${id} 0 obj\n`);
    body();
    write("\nendobj\n");
  };
  write("%PDF-1.4\n%Solaistore receipt\n");
  object(1, () => write("<< /Type /Catalog /Pages 2 0 R >>"));
  object(2, () =>
    write(
      `<< /Type /Pages /Count ${images.length} /Kids [${images.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] >>`,
    ),
  );
  images.forEach((image, i) => {
    const page = 3 + i * 3,
      img = page + 1,
      content = page + 2;
    object(page, () =>
      write(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Receipt ${img} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
    object(img, () => {
      write(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`,
      );
      write(image.bytes);
      write("\nendstream");
    });
    const stream = "q\n595 0 0 842 0 0 cm\n/Receipt Do\nQ\n";
    object(content, () =>
      write(
        `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`,
      ),
    );
  });
  const start = size;
  write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++)
    write(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  write(
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`,
  );
  const result = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}
export async function createReceiptPdf(receipt: Receipt): Promise<Blob> {
  await document.fonts.ready;
  const canvases: HTMLCanvasElement[] = [];
  let canvas: HTMLCanvasElement,
    ctx!: CanvasRenderingContext2D,
    y = 0;
  function text(
    value: string,
    x: number,
    top: number,
    size = 10,
    color = "#243c34",
    weight = 400,
    align: CanvasTextAlign = "left",
  ) {
    ctx.font = `${weight} ${size}px "Segoe UI", "Noto Sans", sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, top);
  }
  function wrap(value: string, width: number, size = 10): string[] {
    ctx.font = `400 ${size}px "Segoe UI", "Noto Sans", sans-serif`;
    const lines: string[] = [];
    let line = "";
    for (const paragraph of value.split("\n")) {
      if (line) {
        lines.push(line.trimEnd());
        line = "";
      }
      for (const word of paragraph.match(/\S+|\s+/gu) ?? []) {
        if (ctx.measureText(line + word).width > width && line.trim()) {
          lines.push(line.trimEnd());
          line = "";
        }
        if (ctx.measureText(word).width > width) {
          for (const char of word) {
            if (ctx.measureText(line + char).width > width) {
              lines.push(line.trimEnd());
              line = "";
            }
            line += char;
          }
        } else line += line || word.trim() ? word : "";
      }
      lines.push(line.trimEnd());
      line = "";
    }
    return lines.length ? lines : [""];
  }
  function rule(top: number) {
    ctx.strokeStyle = "#e1e6e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, top);
    ctx.lineTo(555, top);
    ctx.stroke();
  }
  function tableHeader() {
    ctx.fillStyle = "#edf3ee";
    ctx.fillRect(40, y, 515, 27);
    text("ITEM", 50, y + 18, 9, "#506758", 600);
    text("QTY", 374, y + 18, 9, "#506758", 600, "right");
    text("UNIT PRICE", 454, y + 18, 9, "#506758", 600, "right");
    text("AMOUNT", 545, y + 18, 9, "#506758", 600, "right");
    y += 40;
  }
  function newPage(continuation = false) {
    canvas = document.createElement("canvas");
    canvas.width = 1190;
    canvas.height = 1684;
    ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 595, 842);
    canvases.push(canvas);
    ctx.fillStyle = "#173c31";
    ctx.fillRect(0, 0, 595, 9);
    text(receipt.storeName ?? "Solaistore", 40, 55, 27, "#173c31", 700);
    text(
      continuation ? "ORDER RECEIPT - CONTINUED" : "ORDER RECEIPT",
      555,
      49,
      10,
      "#68776c",
      600,
      "right",
    );
    rule(77);
    y = 104;
    if (continuation) {
      text(`Order ${receipt.orderId}`, 40, y, 9, "#68776c");
      y += 25;
      tableHeader();
    }
  }
  newPage();
  text("Thank you for your order.", 40, y, 22, "#173c31", 700);
  y += 26;
  text(
    "Your order is confirmed. Keep this receipt for your records.",
    40,
    y,
    10,
    "#68776c",
  );
  y += 36;
  text("ORDER NUMBER", 40, y, 8, "#68776c", 600);
  text("CONFIRMED ON", 350, y, 8, "#68776c", 600);
  y += 17;
  text(receipt.orderId, 40, y, 9);
  text(
    receipt.confirmedAt ? date(receipt.confirmedAt) : "Confirmed",
    350,
    y,
    10,
  );
  y += 33;
  if (receipt.recipient) {
    text("DELIVER TO", 40, y, 8, "#68776c", 600);
    y += 18;
    for (const line of wrap(
      `${receipt.recipient.name}\n${receipt.recipient.address}\n${receipt.recipient.city} ${receipt.recipient.postalCode}`,
      500,
      10,
    )) {
      text(line, 40, y);
      y += 15;
    }
    y += 19;
  }
  tableHeader();
  for (const item of receipt.items) {
    const all = wrap(item.name, 275, 11);
    for (let offset = 0; offset < all.length; offset += 25) {
      const nameLines = all.slice(offset, offset + 25);
      const height = Math.max(42, nameLines.length * 15 + 24);
      if (y + height > 718) newPage(true);
      nameLines.forEach((line, i) => {
        text(line, 50, y + i * 15, 11, "#243c34", 500);
      });
      text(
        `${item.code}${offset ? " (continued)" : ""}`,
        50,
        y + nameLines.length * 15,
        8,
        "#758078",
      );
      if (offset === 0) {
        text(String(item.quantity), 374, y, 10, "#243c34", 400, "right");
        text(money(item.unitPrice), 454, y, 10, "#243c34", 400, "right");
        text(money(item.lineTotal), 545, y, 10, "#243c34", 600, "right");
      }
      y += height;
      rule(y - 13);
    }
  }
  if (y + 260 > 739) newPage();
  y += 12;
  for (const [label, value] of [
    ["Subtotal", money(receipt.subtotal)],
    ...(receipt.coupon && receipt.discount
      ? [[`Coupon (${receipt.coupon.percent}%)`, `−${money(receipt.discount)}`]]
      : []),
    ...(receipt.loyalty?.discount ? [[`Loyalty points (${receipt.loyalty.pointsRedeemed})`,`−${money(receipt.loyalty.discount)}`]] : []),
    ["Estimated tax (10%)", money(receipt.tax)],
    ["Delivery", "Free"],
  ]) {
    text(label, 350, y, 10, "#68776c");
    text(value, 545, y, 10, "#243c34", 400, "right");
    y += 22;
  }
  y += 7;
  ctx.fillStyle = "#edf3ee";
  ctx.fillRect(338, y - 17, 217, 39);
  text("TOTAL (JPY)", 350, y + 8, 11, "#173c31", 700);
  text(money(receipt.total), 545, y + 8, 17, "#173c31", 700, "right");
  y += 60;
  if (receipt.coupon) {
    text(`Coupon applied: ${receipt.coupon.code}`, 40, y, 9, "#68776c");
    y += 18;
  }
  text(
    receipt.payment
      ? `${receipt.payment.provider.startsWith("demo_") ? "DEMO ONLY - NO MONEY CHARGED | " : ""}${receipt.payment.provider.toUpperCase()} | ${receipt.payment.state.toUpperCase()} | ${money(receipt.payment.amountMinor / (receipt.payment.currency === "INR" ? 100 : 1), receipt.payment.currency)}${receipt.payment.state === "due" ? " due on delivery" : ""}`
      : "Historical training order. No online payment was recorded.",
    40,
    y,
    9,
    "#68776c",
  );
  y += 16;
  if (receipt.payment?.currency === "INR") {
    text(
      `Converted from JPY at ${receipt.payment.fxRate.toFixed(6)} INR per JPY (${receipt.payment.fxDate}).`,
      40,
      y,
      9,
      "#68776c",
    );
    y += 16;
  }
  text(
    "This document records the saved order details; it is not a tax invoice.",
    40,
    y,
    9,
    "#68776c",
  );
  for (let i = 0; i < canvases.length; i++) {
    ctx = canvases[i].getContext("2d")!;
    rule(787);
    text(
      "solaistore. | Good finds for everyday living.",
      40,
      808,
      8,
      "#758078",
    );
    text(
      `Page ${i + 1} of ${canvases.length}`,
      555,
      808,
      8,
      "#758078",
      400,
      "right",
    );
  }
  const pages = canvases.map((c) => {
    const base64 = c.toDataURL("image/jpeg", 0.94).split(",")[1];
    return {
      bytes: Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0)),
      width: c.width,
      height: c.height,
    };
  });
  const bytes = imagePdf(pages);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}
export async function downloadReceipt(receipt: Receipt) {
  const blob = await createReceiptPdf(receipt);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `solaistore-receipt-${receipt.orderId.slice(0, 8)}.pdf`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
