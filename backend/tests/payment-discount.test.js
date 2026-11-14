import test from "node:test";
import assert from "node:assert/strict";
import { paymentDiscount } from "../services/payment-discount.js";
import { previewPaymentDiscount } from "../../frontend/src/services/booking-pricing.js";
test("payment-time discount applies to the outstanding balance with half-up rounding", () => {
  assert.deepEqual(paymentDiscount("35000", "FIXED", "5000"), {
    basis: "35000.00",
    amount: "5000.00",
    remaining: "30000.00",
  });
  assert.equal(paymentDiscount("35000", "PERCENTAGE", "10").amount, "3500.00");
  assert.equal(paymentDiscount(".05", "PERCENTAGE", "10").amount, "0.01");
  assert.equal(paymentDiscount("35", "NONE", 0).remaining, "35.00");
  for (const [due, type, value] of [
    ["35", "FIXED", "36"],
    ["35", "PERCENTAGE", "101"],
    ["35", "FIXED", "-1"],
    ["35", "NONE", "1"],
  ])
    assert.throws(() => paymentDiscount(due, type, value));
  const preview = previewPaymentDiscount(
    {
      amount: "10000",
      payment_discount_type: "FIXED",
      payment_discount_value: "5000",
    },
    "35000",
  );
  assert.deepEqual(preview, {
    discount: "5000.00",
    due: "30000.00",
    balance: "20000.00",
  });
  assert.throws(() =>
    previewPaymentDiscount(
      {
        amount: "35000",
        payment_discount_type: "FIXED",
        payment_discount_value: "1",
      },
      "35000",
    ),
  );
});
