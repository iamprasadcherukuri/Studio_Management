function paise(value) {
  const text = String(value ?? "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text))
    throw new Error("Enter a nonnegative amount with at most two decimals");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
const money = (value) =>
  (value / 100n).toString() + "." + (value % 100n).toString().padStart(2, "0");
export function previewBookingPrice(data) {
  try {
    const total = paise(data.total_amount),
      value = paise(data.discount_value || 0),
      type = data.discount_type || "NONE";
    if (type === "PERCENTAGE" && value > 10000n)
      throw new Error("Discount cannot exceed 100%");
    const discount =
      type === "PERCENTAGE"
        ? (total * value + 5000n) / 10000n
        : type === "FIXED"
          ? value
          : 0n;
    if (discount > total) throw new Error("Discount exceeds total");
    return {
      ...data,
      agreed_amount: money(total - discount),
      discount_amount: money(discount),
    };
  } catch {
    return { ...data, agreed_amount: "", discount_amount: "" };
  }
}
