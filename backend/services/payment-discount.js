import Decimal from "decimal.js";
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const bad = (message) => Object.assign(new Error(message), { status: 400 });
export function paymentDiscount(due, type = "NONE", value = 0) {
  const basis = new D(due),
    v = new D(value);
  if (
    !basis.isFinite() ||
    basis.lt(0) ||
    !v.isFinite() ||
    v.lt(0) ||
    !["NONE", "FIXED", "PERCENTAGE"].includes(type)
  )
    throw bad("Invalid payment discount");
  if (type === "NONE" && !v.isZero())
    throw bad("Choose a discount type or set the discount value to zero");
  if (type === "PERCENTAGE" && v.gt(100))
    throw bad("Percentage discount cannot exceed 100%");
  const discount = (
    type === "PERCENTAGE"
      ? basis.times(v).div(100)
      : type === "FIXED"
        ? v
        : new D(0)
  ).toDecimalPlaces(2);
  if (discount.gt(basis)) throw bad("Discount exceeds the outstanding balance");
  return {
    basis: basis.toFixed(2),
    amount: discount.toFixed(2),
    remaining: basis.minus(discount).toFixed(2),
  };
}
