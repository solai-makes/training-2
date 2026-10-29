import { saleWindow } from "./scheduled-price.ts";

export function offerCountdown(
  product: { description: string },
  now = Date.now(),
) {
  const window = saleWindow(product);
  if (!window) return null;
  const start = Date.parse(window.startsAt),
    end = Date.parse(window.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return null;
  const status = now < start ? "scheduled" : now < end ? "active" : "ended";
  const target = status === "scheduled" ? start : end;
  const seconds = Math.max(0, Math.ceil((target - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    status,
    targetAt: new Date(target).toISOString(),
    label:
      status === "scheduled"
        ? "Offer starts in"
        : status === "active"
          ? "Offer ends in"
          : "Offer ended",
    remaining: `${days ? `${days}d ` : ""}${pad(Math.floor(seconds / 3600) % 24)}h ${pad(Math.floor(seconds / 60) % 60)}m ${pad(seconds % 60)}s`,
  };
}
