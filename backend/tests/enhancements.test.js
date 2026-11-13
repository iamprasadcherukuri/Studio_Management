import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { featureInput } from "../services/enhancement-validation.js";
const require = createRequire(import.meta.url);
const fontkit = createRequire(require.resolve("pdfkit"))("fontkit");
test("bundled PDF font renders rupees and Latin customer details", () => {
  const font = fontkit.openSync(
    fileURLToPath(
      new URL("../assets/fonts/NotoSans-Regular.ttf", import.meta.url),
    ),
  );
  for (const char of "₹0123456789Photography")
    assert.ok(
      font.hasGlyphForCodePoint(char.codePointAt(0)),
      `Missing ${char}`,
    );
});
test("invoice input preserves decimal strings and rejects tax until approved", () => {
  const data = {
    booking_id: 1,
    invoice_date: "2026-11-13",
    due_date: "2026-11-20",
    items: [
      { description: "Photography", quantity: "1.125", unit_price: "100.01" },
    ],
    idempotency_key: "8860055f-72ea-4d92-9b3b-12de42353f6a",
  };
  assert.equal(featureInput("invoice", data).items[0].unit_price, "100.01");
  assert.throws(() => featureInput("invoice", { ...data, tax_amount: "18" }));
  assert.throws(() =>
    featureInput("invoice", { ...data, due_date: "2026-11-12" }),
  );
});
test("equipment assignment dates and optional expense links are validated", () => {
  assert.throws(() =>
    featureInput("assignment", {
      equipment_id: 1,
      booking_id: 1,
      assigned_date: "2026-11-14",
      expected_return_date: "2026-11-13",
    }),
  );
  assert.equal(
    featureInput("expense", {
      existing_expense_id: "",
      date: "2026-11-13",
      method: "Cash",
    }).existing_expense_id,
    undefined,
  );
});
