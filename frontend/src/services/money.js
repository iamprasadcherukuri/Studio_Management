export function moneyPaise(value) {
  const text = String(value ?? 0),
    match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) throw new Error("Invalid money value");
  const fraction = match[3] || "",
    rounded =
      BigInt((fraction + "00").slice(0, 2)) +
      (Number(fraction[2] || 0) >= 5 ? 1n : 0n);
  return (BigInt(match[2]) * 100n + rounded) * (match[1] ? -1n : 1n);
}
export function subtractMoney(a, b) {
  const n = moneyPaise(a) - moneyPaise(b),
    abs = n < 0n ? -n : n;
  return (
    (n < 0n ? "-" : "") + abs / 100n + "." + String(abs % 100n).padStart(2, "0")
  );
}
export function formatMoney(value) {
  const n = moneyPaise(value),
    abs = n < 0n ? -n : n,
    whole = (abs / 100n).toString(),
    head =
      whole.length > 3
        ? whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + ","
        : "";
  return (
    (n < 0n ? "-" : "") +
    "₹" +
    head +
    whole.slice(-3) +
    "." +
    String(abs % 100n).padStart(2, "0")
  );
}
