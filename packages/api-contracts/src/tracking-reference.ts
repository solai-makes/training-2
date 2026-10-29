/** Matches the reference already shown on the existing tracking page. */
export function trackingReference(orderId: string): string {
  return `SS-${orderId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}
export function normalizeTrackingReference(value: string): string | null {
  const reference = value.trim().toUpperCase();
  return /^SS-[0-9A-F]{12}$/.test(reference) ? reference : null;
}
