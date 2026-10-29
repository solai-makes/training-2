import assert from "node:assert/strict";
import test from "node:test";
import { deliveryTimeline } from "./delivery-timeline.ts";
import { offerCountdown } from "./offer-countdown.ts";

test("delivery uses exact elapsed hours from confirmation and survives restarts", () => {
  const start = "2026-10-28T00:00:00.000Z",
    epoch = Date.parse(start);
  for (const [elapsed, stage] of [
    [0, "confirmed"],
    [3599999, "confirmed"],
    [3600000, "shipped"],
    [17999999, "shipped"],
    [18000000, "out_for_delivery"],
    [86399999, "out_for_delivery"],
    [86400000, "delivered"],
    [172800000, "delivered"],
  ] as const) {
    assert.equal(
      deliveryTimeline(start, undefined, epoch + elapsed)?.stage,
      stage,
    );
  }
  assert.equal(
    deliveryTimeline(start, undefined, epoch + 86400000)?.history.length,
    4,
  );
  assert.equal(
    deliveryTimeline(start, undefined, epoch + 86400000)?.nextUpdateAt,
    null,
  );
  assert.equal(deliveryTimeline(null), undefined);
  assert.equal(deliveryTimeline("invalid"), undefined);
  assert.equal(deliveryTimeline(start, undefined, epoch - 1), undefined);
});
test("automatic tracking preserves existing manual progress", () => {
  const start = "2026-10-28T00:00:00.000Z",
    shipped = "2026-10-28T00:20:00.000Z";
  const prior = {
    stage: "shipped",
    history: [{ stage: "shipped", at: shipped }],
  };
  const result = deliveryTimeline(start, prior, Date.parse(start) + 30 * 60000);
  assert.equal(result?.stage, "shipped");
  assert.equal(
    result?.history.find((event) => event.stage === "shipped")?.at,
    shipped,
  );
  assert.equal(prior.history.length, 1);
});
test("offer countdown changes from starts-in to ends-in at exact boundaries", () => {
  const start = Date.parse("2026-10-28T01:00:00Z"),
    end = start + 86400000;
  const product = {
    description: `[Sale window ${new Date(start).toISOString()} ${new Date(end).toISOString()}]`,
  };
  assert.equal(offerCountdown(product, start - 1000)?.remaining, "00h 00m 01s");
  assert.equal(offerCountdown(product, start - 1)?.status, "scheduled");
  assert.equal(offerCountdown(product, start)?.label, "Offer ends in");
  assert.equal(offerCountdown(product, start)?.remaining, "1d 00h 00m 00s");
  assert.equal(offerCountdown(product, end)?.label, "Offer ended");
  assert.equal(offerCountdown({ description: "No scheduled offer" }), null);
});
