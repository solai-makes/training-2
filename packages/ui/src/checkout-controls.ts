export function quantityFromText(
  value: string,
  previous: number,
  maximum: number,
) {
  if (!/^\d+$/.test(value))
    return { quantity: previous, adjusted: false, invalid: value !== "" };
  if (maximum < 1)
    return { quantity: previous, adjusted: false, invalid: true };
  const requested = Number(value);
  const quantity = Math.max(1, Math.min(maximum, requested));
  return { quantity, adjusted: requested !== quantity, invalid: false };
}
export function pointsFromText(value: string, maximum: number) {
  if (!/^\d*$/.test(value)) return null;
  const points = value === "" ? 0 : Number(value);
  return Number.isSafeInteger(points) && points >= 0 && points <= maximum
    ? points
    : null;
}
