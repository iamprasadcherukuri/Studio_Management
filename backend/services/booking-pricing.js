import Decimal from "decimal.js";
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const bad = (message) => Object.assign(new Error(message), { status: 400 });
export function bookingPricing(data, old) {
  if (data.total_amount === undefined) {
    if (data.agreed_amount === undefined)
      throw bad("Enter the total booking amount");
    if (
      (data.discount_type && data.discount_type !== "NONE") ||
      Number(data.discount_value || 0) > 0
    )
      throw bad("Enter the total booking amount when choosing a discount");
    const discount = new D(data.discount_amount ?? old?.discount_amount ?? 0),
      net = new D(data.agreed_amount);
    if (discount.lt(0) || net.lt(0) || net.plus(discount).gt("9999999999.99"))
      throw bad("Invalid booking amount or discount");
    if (old && data.discount_amount === undefined && net.eq(old.agreed_amount))
      return {
        agreed_amount: net.toFixed(2),
        discount_amount: discount.toFixed(2),
        discount_type: old.discount_type,
        discount_value: old.discount_value,
      };
    if (
      old?.discount_type === "PERCENTAGE" &&
      !net.eq(old.agreed_amount) &&
      data.discount_amount === undefined
    )
      throw bad(
        "Use total amount and discount fields to edit a percentage-discounted booking",
      );
    return {
      agreed_amount: net.toFixed(2),
      discount_amount: discount.toFixed(2),
      discount_type: discount.gt(0) ? "FIXED" : "NONE",
      discount_value: discount.toFixed(2),
    };
  }
  const total = new D(data.total_amount),
    type = data.discount_type || "NONE",
    value = new D(data.discount_value || 0);
  if (total.lt(0) || total.gt("9999999999.99") || value.lt(0))
    throw bad("Invalid booking amount or discount");
  if (type === "PERCENTAGE" && value.gt(100))
    throw bad("Percentage discount cannot exceed 100%");
  if (type === "NONE" && !value.isZero())
    throw bad("Choose a discount type or set its value to zero");
  const discount = (
    type === "PERCENTAGE"
      ? total.times(value).div(100)
      : type === "FIXED"
        ? value
        : new D(0)
  ).toDecimalPlaces(2);
  if (discount.gt(total))
    throw bad("Discount cannot exceed the total booking amount");
  const net = total.minus(discount);
  if (data.agreed_amount !== undefined && !net.eq(data.agreed_amount))
    throw bad("Final agreed amount does not match the total and discount");
  return {
    agreed_amount: net.toFixed(2),
    discount_type: type,
    discount_value: value.toFixed(2),
    discount_amount: discount.toFixed(2),
  };
}
