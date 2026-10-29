export const TRACKING_STAGES = [
  "confirmed",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
] as const;
export type TrackingStage = (typeof TRACKING_STAGES)[number];
export const trackingLabel = (stage: string) =>
  ({
    confirmed: "Confirmed",
    packed: "Packed",
    shipped: "Shipped",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
  })[stage] ?? stage;
export type Tracking = {
  mode?: "automatic_demo";
  expectedDeliveryAt?: string;
  nextUpdateAt?: string | null;
  stage: TrackingStage;
  history: Array<{ stage: TrackingStage; at: string }>;
};
