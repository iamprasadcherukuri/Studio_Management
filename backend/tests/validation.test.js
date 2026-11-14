import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "../services/validation.js";
const payment = {
  booking_id: 1,
  date: "2026-11-13",
  amount: 100,
  method: "Cash",
  idempotency_key: "8860055f-72ea-4d92-9b3b-12de42353f6a",
};
test("staff requires DOB, email and address; all mobile fields accept exactly 10 digits", () => {
  const staff = {
    name: "Photographer",
    mobile: "0123456789",
    dob: "1990-02-28",
    email: "staff@example.test",
    address: "Hyderabad",
  };
  assert.equal(parse("staff", staff).mobile, "0123456789");
  for (const patch of [
    { dob: "" },
    { dob: "2025-02-30" },
    { dob: "2099-01-01" },
    { email: "" },
    { email: "invalid" },
    { address: " " },
    { mobile: "123456789" },
    { mobile: "12345678901" },
    { mobile: "98765abcde" },
    { mobile: "+919876543210" },
  ])
    assert.throws(() => parse("staff", { ...staff, ...patch }));
  for (const field of ["dob", "email", "address"]) {
    const missing = { ...staff };
    delete missing[field];
    assert.throws(() => parse("staff", missing));
  }
  assert.equal(parse("staff", { ...staff, mobile: "" }).mobile, null);
  for (const mobile of ["123456789", "12345678901", "abcdefghij"]) {
    assert.throws(() => parse("customers", { name: "Customer", mobile }));
    assert.throws(() =>
      parse("customers", {
        name: "Customer",
        mobile: "9876543210",
        alternate_mobile: mobile,
      }),
    );
    assert.throws(() =>
      parse("settings", {
        name: "Studio",
        phone: mobile,
        email: "",
        address: "",
      }),
    );
  }
});
test("payments require positive amounts, valid dates and an idempotency key", () => {
  assert.equal(parse("payments", payment).amount, 100);
  for (const patch of [
    { amount: 0 },
    { amount: -1 },
    { amount: 1.234 },
    { date: "2026-02-30" },
    { idempotency_key: "" },
    { method: "" },
  ])
    assert.throws(() => parse("payments", { ...payment, ...patch }));
});
test("album delivery requires an actual date and acknowledgement", () => {
  const a = {
    booking_id: 1,
    album_type: "Wedding",
    size: "12x18",
    pages: 30,
    printing_cost: 1500,
    status: "Delivered",
  };
  assert.throws(() => parse("albums", a));
  assert.equal(
    parse("albums", {
      ...a,
      actual_delivery: "2026-11-13",
      acknowledgement: "Received by customer",
    }).status,
    "Delivered",
  );
});
test("booking identifiers and money are validated and optional package is normalized", () => {
  const b = {
    customer_id: "1",
    event_type_id: "1",
    package_id: "",
    event_date: "2026-11-14",
    location: "Studio",
    agreed_amount: "15000",
    status: "confirmed",
  };
  assert.equal(parse("bookings", b).package_id, null);
  assert.throws(() => parse("bookings", { ...b, agreed_amount: -10 }));
  assert.throws(() => parse("bookings", { ...b, customer_id: "bad" }));
});
test("new users require long passwords and valid roles", () => {
  assert.throws(() =>
    parse("users", {
      name: "Admin",
      email: "admin@example.test",
      password: "short",
      role: "admin",
    }),
  );
  assert.throws(() =>
    parse("users", {
      name: "Admin",
      email: "admin@example.test",
      password: "LongEnough12345",
      role: "owner",
    }),
  );
});
