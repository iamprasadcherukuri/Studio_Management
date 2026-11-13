import test from "node:test";
import assert from "node:assert/strict";
import { bookingPricing } from "../services/booking-pricing.js";
import { amountInWords } from "../services/amount-words.js";
import { previewBookingPrice } from "../../frontend/src/services/booking-pricing.js";
test("percentage, fixed and no discount preserve final agreed amount semantics", () => {
  for (const [type, value, net] of [
    ["PERCENTAGE", "10", "45000.00"],
    ["FIXED", "5000", "45000.00"],
    ["NONE", "0", "50000.00"],
  ]) {
    const data = {
      total_amount: "50000",
      discount_type: type,
      discount_value: value,
    };
    const result = bookingPricing(data);
    assert.equal(result.agreed_amount, net);
    assert.equal(previewBookingPrice(data).agreed_amount, net);
  }
  assert.equal(
    bookingPricing({ agreed_amount: "45000" }).agreed_amount,
    "45000.00",
  );
});
test("discounts use half-up paise rounding and reject invalid totals/percentages", () => {
  const data = {
    total_amount: "0.05",
    discount_type: "PERCENTAGE",
    discount_value: "10",
  };
  assert.equal(bookingPricing(data).discount_amount, "0.01");
  assert.equal(previewBookingPrice(data).agreed_amount, "0.04");
  for (const input of [
    {
      total_amount: "50000",
      discount_type: "PERCENTAGE",
      discount_value: "101",
    },
    { total_amount: "50000", discount_type: "FIXED", discount_value: "50001" },
    {
      total_amount: "50000",
      discount_type: "FIXED",
      discount_value: "5000",
      agreed_amount: "50000",
    },
  ])
    assert.throws(() => bookingPricing(input));
});
test("amount in words supports Indian groups and paise", () => {
  assert.equal(amountInWords("10000"), "Ten Thousand Rupees Only");
  assert.equal(
    amountInWords("100000.25"),
    "One Lakh Rupees and Twenty Five Paise Only",
  );
  assert.equal(amountInWords("1.01"), "One Rupee and One Paisa Only");
  assert.equal(amountInWords("0"), "Zero Rupees Only");
});
