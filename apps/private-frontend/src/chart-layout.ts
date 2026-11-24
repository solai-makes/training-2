export function revenueGeometry(
  values: number[],
  labels: string[],
  width = 680,
) {
  const W = Math.max(280, width),
    H = 290,
    top = 24,
    bottom = 234,
    right = W - 18;
  const actual = Math.max(0, ...values.filter(Number.isFinite));
  const rough = Math.max(1, actual) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(
    1,
    [1, 2, 2.5, 5, 10].find((value) => value * magnitude >= rough)! * magnitude,
  );
  const maximum = step * 3;
  const left = Math.min(
    W - 100,
    Math.max(72, ...labels.map((label) => label.length * 7.4 + 20)),
  );
  const points = values.map((value, index) => ({
    x:
      values.length === 1
        ? (left + right) / 2
        : left + (index * (right - left)) / Math.max(1, values.length - 1),
    y:
      bottom -
      (Math.max(0, Number.isFinite(value) ? value : 0) / maximum) *
        (bottom - top),
  }));
  return {
    width: W,
    height: H,
    left,
    right,
    top,
    bottom,
    maximum,
    step,
    points,
  };
}
export function revenueScaleMaximum(values: number[]) {
  const maximum = Math.max(0, ...values.filter(Number.isFinite)),
    rough = Math.max(1, maximum) / 3,
    magnitude = 10 ** Math.floor(Math.log10(rough));
  return (
    Math.max(
      1,
      [1, 2, 2.5, 5, 10].find((value) => value * magnitude >= rough)! *
        magnitude,
    ) * 3
  );
}
