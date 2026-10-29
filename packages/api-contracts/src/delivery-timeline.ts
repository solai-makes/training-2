export const DELIVERY_STEPS = [
  "confirmed",
  "shipped",
  "out_for_delivery",
  "delivered",
] as const;
export type DeliveryStage = (typeof DELIVERY_STEPS)[number];
type PriorTracking = {
  stage: string;
  history: Array<{ stage: string; at: string }>;
};
export type DeliveryTracking = {
  stage: DeliveryStage;
  mode: "automatic_demo";
  expectedDeliveryAt: string;
  nextUpdateAt: string | null;
  history: Array<{ stage: DeliveryStage; at: string }>;
};
const offsets = [0, 60 * 60_000, 5 * 60 * 60_000, 24 * 60 * 60_000];

/** Demo fulfillment is calculated from the saved confirmation time, including after server restarts. */
export function deliveryTimeline(
  confirmedAt: string | null | undefined,
  prior?: PriorTracking,
  now = Date.now(),
): DeliveryTracking | undefined {
  const start = Date.parse(confirmedAt ?? "");
  if (!Number.isFinite(start) || start > now) return undefined;
  let index = offsets.reduce(
    (current, offset, i) => (start + offset <= now ? i : current),
    0,
  );
  // An existing staff update must never move backwards when automatic mode is introduced.
  index = Math.max(
    index,
    DELIVERY_STEPS.indexOf(prior?.stage as DeliveryStage),
  );
  const history: DeliveryTracking["history"] = [];
  DELIVERY_STEPS.forEach((stage, i) => {
    if (i > index) return;
    const recorded = prior?.history.find(
      (event) =>
        event.stage === stage &&
        Number.isFinite(Date.parse(event.at)) &&
        Date.parse(event.at) <= now,
    );
    if (recorded) history.push({ stage, at: recorded.at });
    else if (start + offsets[i] <= now)
      history.push({ stage, at: new Date(start + offsets[i]).toISOString() });
  });
  return {
    stage: DELIVERY_STEPS[index],
    mode: "automatic_demo",
    expectedDeliveryAt: new Date(start + offsets[3]).toISOString(),
    nextUpdateAt:
      index < 3 ? new Date(start + offsets[index + 1]).toISOString() : null,
    history,
  };
}
