import test from "node:test";
import assert from "node:assert/strict";
import { bookingPricing } from "../services/booking-pricing.js";
import { passwordInput, parse } from "../services/validation.js";
import { previewBookingPrice } from "../../frontend/src/services/booking-pricing.js";
import {
  formatMoney,
  subtractMoney,
} from "../../frontend/src/services/money.js";
test("F01 booking discounts stay separate from one or multiple payment discounts", () => {
  const old = {
    agreed_amount: "38000",
    discount_amount: "12000",
    discount_type: "FIXED",
    discount_value: "12000",
    booking_discount_type: "PERCENTAGE",
    booking_discount_value: "10",
    booking_discount_amount: "5000",
  };
  const unchanged = bookingPricing(
    {
      total_amount: "50000",
      discount_type: "FIXED",
      discount_value: "12000",
      agreed_amount: "38000",
    },
    old,
    "7000",
  );
  assert.equal(unchanged.agreed_amount, "38000.00");
  const edited = bookingPricing(
    {
      total_amount: "50000",
      booking_discount_type: "NONE",
      booking_discount_value: 0,
    },
    old,
    "7000",
  );
  assert.equal(edited.discount_amount, "7000.00");
  assert.equal(edited.booking_discount_amount, "0.00");
  assert.equal(edited.agreed_amount, "43000.00");
  assert.equal(
    previewBookingPrice({
      total_amount: "50000",
      booking_discount_type: "NONE",
      booking_discount_value: 0,
      payment_discounts: "7000",
    }).agreed_amount,
    "43000.00",
  );
  assert.throws(() =>
    bookingPricing(
      {
        total_amount: "6000",
        booking_discount_type: "NONE",
        booking_discount_value: 0,
      },
      old,
      "7000",
    ),
  );
  assert.throws(() =>
    bookingPricing({ agreed_amount: "50000", discount_amount: 0 }, old, "7000"),
  );
});
test("P07 password hashing inputs use a shared UTF-8 byte limit", () => {
  assert.equal(passwordInput.parse("a".repeat(72)).length, 72);
  const password = "é".repeat(36) + "suffix";
  assert.throws(() => passwordInput.parse(password), /UTF-8/);
  assert.throws(
    () =>
      parse("users", {
        name: "Test",
        email: "test@example.test",
        role: "staff",
        password,
      }),
    /UTF-8/,
  );
  assert.throws(
    () =>
      parse("changePassword", {
        current_password: "current",
        new_password: password,
      }),
    /UTF-8/,
  );
  assert.throws(()=>parse('resetPassword',{current_password:password}),/UTF-8/);
});
test("F03 currency totals remain exact beyond JavaScript safe cent precision", () => {
  assert.equal(
    formatMoney("9007199254740993.01").replaceAll(",", "").replace("₹", ""),
    "9007199254740993.01",
  );
  assert.equal(
    subtractMoney("9007199254740993.01", "0.02"),
    "9007199254740992.99",
  );
  assert.equal(formatMoney("-0.05"), "-₹0.05");
  assert.equal(
    formatMoney("12000001000.01").replaceAll(",", "").replace("₹", ""),
    "12000001000.01",
  );
});
