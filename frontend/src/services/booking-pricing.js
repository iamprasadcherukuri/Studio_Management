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
      value = paise(data.booking_discount_value ?? data.discount_value ?? 0),
      type = data.booking_discount_type ?? data.discount_type ?? "NONE",
      granted = paise(data.payment_discounts || 0);
    if (type === "PERCENTAGE" && value > 10000n)
      throw new Error("Discount cannot exceed 100%");
    const discount =
      type === "PERCENTAGE"
        ? (total * value + 5000n) / 10000n
        : type === "FIXED"
          ? value
          : 0n;
    if (discount + granted > total) throw new Error("Discount exceeds total");
    return {
      ...data,
      agreed_amount: money(total - discount - granted),
      discount_amount: money(discount + granted),
      booking_discount_amount: money(discount),
    };
  } catch {
    return { ...data, agreed_amount: "", discount_amount: "" };
  }
}
export function previewPaymentDiscount(data, outstanding) {
  const due = paise(outstanding),
    value = paise(data.payment_discount_value || 0),
    payment = paise(data.amount || 0),
    type = data.payment_discount_type || "NONE";
  if (type === "PERCENTAGE" && value > 10000n)
    throw new Error("Percentage discount cannot exceed 100%");
  if (type === "NONE" && value !== 0n)
    throw new Error("Choose a discount type or set the discount value to zero");
  const discount =
    type === "PERCENTAGE"
      ? (due * value + 5000n) / 10000n
      : type === "FIXED"
        ? value
        : 0n;
  if (discount > due)
    throw new Error("Discount exceeds the outstanding balance");
  if (payment > due - discount)
    throw new Error("Payment exceeds the balance after discount");
  return {
    discount: money(discount),
    due: money(due - discount),
    balance: money(due - discount - payment),
  };
}
