import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import bcrypt from "bcryptjs";
import pg from "pg";
import { migrate } from "../database/migrate.js";
const schema = "studio_test_" + randomBytes(6).toString("hex");
assert.match(schema, /^studio_test_[a-f0-9]{12}$/);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let server, pool;
function png() {
  const crc = (buffer) => {
    let n = 0xffffffff;
    for (const byte of buffer) {
      n ^= byte;
      for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
    }
    return (n ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, bytes) => {
    const type = Buffer.from(name),
      out = Buffer.alloc(bytes.length + 12);
    out.writeUInt32BE(bytes.length);
    type.copy(out, 4);
    bytes.copy(out, 8);
    out.writeUInt32BE(crc(Buffer.concat([type, bytes])), out.length - 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from([0, 0, 80, 180]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
try {
  await client.query(
    (
      await readFile(new URL("../database/schema.sql", import.meta.url), "utf8")
    ).replace(/\bstudio\b/g, schema),
  );
  await client.query(`SET search_path TO ${schema},public`);
  const password = randomBytes(18).toString("hex");
  const hash = await bcrypt.hash(password, 12);
  const user = (
    await client.query(
      "INSERT INTO users(name,email,password_hash,role_id) SELECT 'Receipt Admin','receipt@example.test',$1,id FROM roles WHERE name='admin' RETURNING id",
      [hash],
    )
  ).rows[0];
  const customer = (
    await client.query(
      "INSERT INTO customers(name,mobile,email) VALUES('Rahul Kumar','9876543210','rahul@example.test') RETURNING id",
    )
  ).rows[0];
  const event = (
    await client.query("SELECT id FROM event_types WHERE name='Wedding'")
  ).rows[0];
  const oldBooking = (
    await client.query(
      "INSERT INTO bookings(customer_id,event_type_id,event_date,location,agreed_amount) VALUES($1,$2,'2026-12-20','Hyderabad',1000) RETURNING id",
      [customer.id, event.id],
    )
  ).rows[0];
  const oldPayment = (
    await client.query(
      "INSERT INTO payments(booking_id,date,amount,method,idempotency_key,created_by) VALUES($1,CURRENT_DATE,100,'Cheque',$2,$3) RETURNING id",
      [oldBooking.id, randomUUID(), user.id],
    )
  ).rows[0];
  await migrate(client, schema);
  process.env.NODE_ENV = "test";
  process.env.DB_SCHEMA = schema;
  process.env.DATABASE_TARGET = "local";
  const { app } = await import("../server.js");
  ({ pool } = await import("../database/pool.js"));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let token;
  async function call(path, method = "GET", body, status = 200) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    assert.equal(
      response.status,
      status,
      `${method} ${path}: ${JSON.stringify(data)}`,
    );
    return data;
  }
  token = (
    await call("/auth/login", "POST", {
      email: "receipt@example.test",
      password,
    })
  ).token;
  const today = (
    await client.query(
      "SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date::text AS today",
    )
  ).rows[0].today;
  const settings = {
    name: "Studio Photography",
    phone: "9876543210",
    email: "info@studio.example",
    address: "Hyderabad, Telangana",
    tagline: "Photography & Videography Services",
    signatory_title: "Studio Manager",
    signatory_name: "",
    receipt_footer: "",
  };
  await call("/settings", "PUT", settings);
  const bookingBody = {
    customer_id: customer.id,
    event_type_id: event.id,
    event_date: "2026-12-20",
    location: "Hyderabad",
    total_amount: "50000",
    discount_type: "PERCENTAGE",
    discount_value: "10",
    status: "confirmed",
    staff_ids: [],
  };
  const booking = await call("/bookings", "POST", bookingBody, 201);
  assert.equal(booking.agreed_amount, "45000.00");
  assert.equal(booking.discount_amount, "5000.00");
  const fixed = await call(
    "/bookings",
    "POST",
    { ...bookingBody, discount_type: "FIXED", discount_value: "5000" },
    201,
  );
  assert.equal(fixed.agreed_amount, "45000.00");
  const undiscounted = await call(
    "/bookings",
    "POST",
    { ...bookingBody, discount_type: "NONE", discount_value: "0" },
    201,
  );
  assert.equal(undiscounted.agreed_amount, "50000.00");
  await call(
    "/bookings",
    "POST",
    { ...bookingBody, discount_value: "101" },
    400,
  );
  await call(
    "/bookings",
    "POST",
    { ...bookingBody, discount_type: "FIXED", discount_value: "50001" },
    400,
  );
  const firstInput = {
    booking_id: booking.id,
    date: today,
    amount: "5000",
    method: "UPI",
    payment_type: "Advance",
    idempotency_key: randomUUID(),
  };
  const first = await call("/payments", "POST", firstInput, 201);
  assert.match(
    first.receipt_number,
    new RegExp("^REC-" + today.slice(0, 4) + "-001$"),
  );
  const secondInput = {
    ...firstInput,
    amount: "10000",
    payment_type: "Partial",
    reference: "UPI123456789",
    idempotency_key: randomUUID(),
  };
  const second = await call("/payments", "POST", secondInput, 201);
  assert.equal(
    (await call("/payments", "POST", secondInput, 201)).id,
    second.id,
  );
  const receipt = await call(`/payments/${second.id}/receipt`);
  assert.equal(receipt.gross_amount, "50000.00");
  assert.equal(receipt.discount_amount, "5000.00");
  assert.equal(receipt.final_amount, "45000.00");
  assert.equal(receipt.previously_paid, "5000.00");
  assert.equal(receipt.current_payment, "10000.00");
  assert.equal(receipt.balance_due, "30000.00");
  assert.equal(receipt.amount_in_words, "Ten Thousand Rupees Only");
  assert.equal(receipt.basis, "recorded");
  await mkdir(new URL("../../test-results/", import.meta.url), {
    recursive: true,
  });
  for (let i = 0; i < 2; i++) {
    const response = await fetch(base + `/payments/${second.id}/receipt/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
    assert.equal(
      (buffer.toString("latin1").match(/\/Type \/Page\b/g) || []).length,
      1,
    );
    if (!i)
      await writeFile(
        new URL("../../test-results/receipt-reference.pdf", import.meta.url),
        buffer,
      );
  }
  await call(
    "/payments",
    "POST",
    {
      ...firstInput,
      amount: "100",
      payment_type: "Final",
      idempotency_key: randomUUID(),
    },
    400,
  );
  const final = await call(
    "/payments",
    "POST",
    {
      ...firstInput,
      amount: "30000",
      payment_type: "Final",
      method: "Card",
      idempotency_key: randomUUID(),
    },
    201,
  );
  assert.equal(
    (await call(`/payments/${final.id}/receipt`)).balance_due,
    "0.00",
  );
  await call(
    "/payments",
    "POST",
    { ...firstInput, amount: "1", idempotency_key: randomUUID() },
    400,
  );
  await call(
    "/payments",
    "POST",
    { ...firstInput, amount: "-1", idempotency_key: randomUUID() },
    400,
  );
  await call("/settings", "PUT", {
    ...settings,
    name: "Changed Studio",
    logo_data_url: "data:image/png;base64," + png().toString("base64"),
  });
  await call(
    "/settings",
    "PUT",
    { ...settings, logo_data_url: "data:image/svg+xml;base64,PHN2Zz4=" },
    400,
  );
  await call(`/bookings/${booking.id}`, "PUT", {
    ...bookingBody,
    location: "Changed Venue",
    discount_type: "FIXED",
    discount_value: "5000",
  });
  const historical = await call(`/payments/${second.id}/receipt`);
  assert.equal(historical.studio.name, "Studio Photography");
  assert.equal(historical.venue, "Hyderabad");
  assert.equal(historical.discount_type, "PERCENTAGE");
  assert.equal(historical.balance_due, "30000.00");
  await assert.rejects(
    () => client.query("UPDATE payments SET amount=1 WHERE id=$1", [second.id]),
    (error) => error.code === "P0001",
  );
  await call(
    `/payments/${second.id}/reversals`,
    "POST",
    {
      date: today,
      amount: "1000",
      reason: "Partial refund",
      idempotency_key: randomUUID(),
    },
    201,
  );
  const refunded = await call(`/payments/${second.id}/receipt`);
  assert.equal(refunded.reversed_amount, "1000.00");
  assert.equal(refunded.payment_status, "Partially Reversed");
  assert.equal(refunded.balance_due, "30000.00");
  const legacy = await call(`/payments/${oldPayment.id}/receipt`);
  assert.equal(
    legacy.receipt_number,
    "PAY-" + String(oldPayment.id).padStart(5, "0"),
  );
  assert.equal(legacy.basis, "reconstructed");
  assert.equal(
    (
      await client.query("SELECT amount FROM payments WHERE id=$1", [
        oldPayment.id,
      ])
    ).rows[0].amount,
    "100.00",
  );
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      fetch(base + "/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...firstInput,
          booking_id: undiscounted.id,
          amount: "1",
          idempotency_key: randomUUID(),
        }),
      }).then(async (response) => {
        assert.equal(response.status, 201);
        return response.json();
      }),
    ),
  );
  assert.notEqual(concurrent[0].receipt_number, concurrent[1].receipt_number);
  const paymentBooking = await call("/bookings", "POST", bookingBody, 201);
  const paymentInput = {
    ...firstInput,
    booking_id: paymentBooking.id,
    amount: "10000",
    payment_type: "Partial",
    idempotency_key: randomUUID(),
  };
  const beforeDiscount = await call("/payments", "POST", paymentInput, 201);
  const previousSnapshot = await call(`/payments/${beforeDiscount.id}/receipt`);
  const discountedInput = {
    ...paymentInput,
    payment_discount_type: "FIXED",
    payment_discount_value: "5000",
    idempotency_key: randomUUID(),
  };
  for (const patch of [
    { payment_discount_value: "35001" },
    { payment_discount_type: "PERCENTAGE", payment_discount_value: "101" },
    { amount: "31000" },
    { method: "Unknown" },
  ])
    await call(
      "/payments",
      "POST",
      { ...discountedInput, ...patch, idempotency_key: randomUUID() },
      400,
    );
  assert.equal(
    (await call(`/bookings/${paymentBooking.id}`)).agreed_amount,
    "45000.00",
  );
  const discounted = await Promise.all(
    [1, 2].map(() => call("/payments", "POST", discountedInput, 201)),
  );
  assert.equal(discounted[0].id, discounted[1].id);
  const discountedReceipt = await call(`/payments/${discounted[0].id}/receipt`);
  assert.equal(discountedReceipt.outstanding_before_discount, "35000.00");
  assert.equal(discountedReceipt.payment_discount_amount, "5000.00");
  assert.equal(discountedReceipt.discount_amount, "10000.00");
  assert.equal(discountedReceipt.final_amount, "40000.00");
  assert.equal(discountedReceipt.balance_due, "20000.00");
  assert.equal(
    (await call(`/bookings/${paymentBooking.id}`)).total_amount,
    "50000.00",
  );
  assert.deepEqual(
    await call(`/payments/${beforeDiscount.id}/receipt`),
    previousSnapshot,
  );
  await call(
    "/payments",
    "POST",
    { ...discountedInput, payment_discount_value: "4000" },
    400,
  );
  await assert.rejects(
    () =>
      client.query(
        "UPDATE payments SET payment_discount_amount=1 WHERE id=$1",
        [discounted[0].id],
      ),
    /immutable/,
  );
  const percentage = await call(
    "/payments",
    "POST",
    {
      ...paymentInput,
      amount: "1000",
      payment_discount_type: "PERCENTAGE",
      payment_discount_value: "10",
      idempotency_key: randomUUID(),
    },
    201,
  );
  const percentReceipt = await call(`/payments/${percentage.id}/receipt`);
  assert.equal(percentReceipt.payment_discount_amount, "2000.00");
  assert.equal(percentReceipt.balance_due, "17000.00");
  const discountPdf = await fetch(
    base + `/payments/${discounted[0].id}/receipt/pdf`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.equal(discountPdf.status, 200);
  const discountBuffer = Buffer.from(await discountPdf.arrayBuffer());
  assert.equal(
    (discountBuffer.toString("latin1").match(/\/Type \/Page\b/g) || []).length,
    1,
  );
  await writeFile(
    new URL("../../test-results/payment-discount-receipt.pdf", import.meta.url),
    discountBuffer,
  );
  await call(
    "/payments",
    "POST",
    {
      ...paymentInput,
      payment_type: "Final",
      amount: "17000",
      idempotency_key: randomUUID(),
    },
    201,
  );
  assert.equal(
    (await call(`/bookings/${paymentBooking.id}`)).outstanding,
    "0.00",
  );
  await call(
    `/payments/${discounted[0].id}/reversals`,
    "POST",
    {
      date: today,
      amount: "1000",
      reason: "Payment discount refund test",
      idempotency_key: randomUUID(),
    },
    201,
  );
  assert.equal(
    (await call(`/bookings/${paymentBooking.id}`)).outstanding,
    "1000.00",
  );
  assert.equal(
    (await call(`/bookings/${paymentBooking.id}`)).discount_amount,
    "12000.00",
  );
  const invoiced = await call(
    "/bookings",
    "POST",
    {
      ...bookingBody,
      total_amount: "1000",
      discount_type: "NONE",
      discount_value: 0,
    },
    201,
  );
  const invoiceInput = {
    booking_id: invoiced.id,
    invoice_date: today,
    due_date: today,
    discount: "0",
    items: [{ description: "Photography", quantity: "1", unit_price: "1000" }],
    idempotency_key: randomUUID(),
  };
  const issued = await call("/invoices", "POST", invoiceInput, 201);
  const lockedPayment = {
    ...paymentInput,
    booking_id: invoiced.id,
    amount: "100",
    payment_discount_type: "FIXED",
    payment_discount_value: "100",
    idempotency_key: randomUUID(),
  };
  await call("/payments", "POST", lockedPayment, 409);
  assert.equal(
    (await call(`/bookings/${invoiced.id}`)).agreed_amount,
    "1000.00",
  );
  await call(`/invoices/${issued.id}/void`, "POST", {
    reason: "Apply newly agreed payment discount",
  });
  await call("/payments", "POST", lockedPayment, 201);
  const replacement = await call(
    "/invoices",
    "POST",
    { ...invoiceInput, discount: "100", idempotency_key: randomUUID() },
    201,
  );
  assert.equal(replacement.total_amount, "900.00");
  const raceBooking = await call(
    "/bookings",
    "POST",
    {
      ...bookingBody,
      total_amount: "1000",
      discount_type: "NONE",
      discount_value: 0,
    },
    201,
  );
  await Promise.all(
    [1, 2].map(() =>
      call(
        "/payments",
        "POST",
        {
          ...paymentInput,
          booking_id: raceBooking.id,
          amount: "100",
          payment_discount_type: "PERCENTAGE",
          payment_discount_value: "10",
          idempotency_key: randomUUID(),
        },
        201,
      ),
    ),
  );
  assert.equal(
    (await call(`/bookings/${raceBooking.id}`)).outstanding,
    "620.00",
  );
  await assert.rejects(() => migrate(client, schema, true), /Rollback refused/);
  console.log(
    "PASS: booking/payment-time fixed and percentage discounts, outstanding-balance calculations, duplicate/concurrent submissions, atomic rollback, active invoice protection and replacement, final settlement, reversals, one-page PDFs and immutable receipts.",
  );
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (pool) await pool.end();
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await client.end();
}
