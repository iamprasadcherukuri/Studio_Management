import Decimal from "decimal.js";
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const bad = (message) => Object.assign(new Error(message), { status: 400 });
function basePricing(data, old) {
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
export function bookingDiscountMetadata(old, paymentDiscounts = 0) {
  const amount = new D(
    old?.booking_discount_amount ??
      new D(old?.discount_amount || 0).minus(paymentDiscounts),
  );
  if (amount.lt(0))
    throw bad(
      "Stored discounts conflict with granted payment discounts; review the financial audit before editing",
    );
  return {
    booking_discount_amount: amount.toFixed(2),
    booking_discount_type:
      old?.booking_discount_type ||
      (new D(paymentDiscounts).isZero()
        ? old?.discount_type
        : amount.gt(0)
          ? "FIXED"
          : "NONE") ||
      "NONE",
    booking_discount_value: String(
      old?.booking_discount_value ??
        (new D(paymentDiscounts).isZero()
          ? (old?.discount_value ?? 0)
          : amount),
    ),
  };
}
export function bookingPricing(data, old, paymentDiscounts = 0) {
  const granted = new D(paymentDiscounts),
    base = bookingDiscountMetadata(old, granted);
  if (data.total_amount === undefined) {
    if (
      data.booking_discount_type !== undefined ||
      data.booking_discount_value !== undefined
    )
      throw bad("Enter the total amount when editing the booking discount");
    const result = basePricing(data, old);
    if (new D(result.discount_amount).lt(granted))
      throw bad("Granted payment discounts must be preserved");
    const same = old && new D(result.discount_amount).eq(old.discount_amount);
    return {
      ...result,
      ...(same
        ? base
        : bookingDiscountMetadata(
            {
              ...result,
              booking_discount_amount: null,
              booking_discount_type: null,
              booking_discount_value: null,
            },
            granted,
          )),
    };
  }
  let type = data.booking_discount_type ?? data.discount_type ?? "NONE",
    value = data.booking_discount_value ?? data.discount_value ?? 0;
  // Older full-record clients send unchanged cumulative fields. Preserve them without applying twice.
  if (
    old &&
    data.booking_discount_type === undefined &&
    data.booking_discount_value === undefined &&
    granted.gt(0) &&
    type === old.discount_type &&
    new D(value).eq(old.discount_value)
  ) {
    type = base.booking_discount_type;
    value = base.booking_discount_value;
  }
  const result = basePricing({
    total_amount: data.total_amount,
    discount_type: type,
    discount_value: value,
  });
  const cumulative = new D(result.discount_amount).plus(granted),
    net = new D(data.total_amount).minus(cumulative);
  if (net.lt(0))
    throw bad(
      "Booking discount plus granted payment discounts exceeds the total amount",
    );
  if (data.agreed_amount !== undefined && !net.eq(data.agreed_amount))
    throw bad("Final agreed amount does not match the total and all discounts");
  return {
    ...result,
    agreed_amount: net.toFixed(2),
    discount_amount: cumulative.toFixed(2),
    discount_type: granted.gt(0) ? "FIXED" : type,
    discount_value: (granted.gt(0) ? cumulative : new D(value)).toFixed(2),
    booking_discount_type: type,
    booking_discount_value: new D(value).toFixed(2),
    booking_discount_amount: result.discount_amount,
  };
}
