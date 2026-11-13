import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { migrate } from "../database/migrate.js";
const schema = "studio_test_" + randomBytes(6).toString("hex");
assert.match(schema, /^studio_test_[a-f0-9]{12}$/);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let server, pool;
try {
  await client.query(
    (
      await readFile(new URL("../database/schema.sql", import.meta.url), "utf8")
    ).replace(/\bstudio\b/g, schema),
  );
  await migrate(client, schema);
  await migrate(client, schema);
  await migrate(client, schema, true);
  await migrate(client, schema);
  process.env.NODE_ENV = "test";
  process.env.DB_SCHEMA = schema;
  process.env.SETUP_TOKEN = randomBytes(24).toString("hex");
  const { app } = await import("../server.js");
  ({ pool } = await import("../database/pool.js"));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let token = "";
  async function call(path, method = "GET", body, status = 200, auth = token) {
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await res.json();
    assert.equal(
      res.status,
      status,
      `${method} ${path}: ${JSON.stringify(result)}`,
    );
    return result;
  }
  const password = randomBytes(18).toString("hex");
  const admin = {
    name: "Feature Admin",
    email: "feature@example.test",
    password,
    setup_token: process.env.SETUP_TOKEN,
  };
  await call("/auth/setup", "POST", admin, 201);
  token = (await call("/auth/login", "POST", admin)).token;
  const customer = await call(
    "/customers",
    "POST",
    { name: "Feature Customer", mobile: "9876543210" },
    201,
  );
  const event = (await call("/lookups")).event_types[0];
  await call("/customers/" + customer.id, "PUT", {
    name: "Feature Customer Updated",
    mobile: "9876543210",
  });
  const disposable = await call(
    "/customers",
    "POST",
    { name: "Disposable fixture", mobile: "9876543211" },
    201,
  );
  await call("/customers/" + disposable.id, "DELETE");
  const today = (await client.query("SELECT CURRENT_DATE::text AS today"))
    .rows[0].today;
  const booking = await call(
    "/bookings",
    "POST",
    {
      customer_id: customer.id,
      event_type_id: event.id,
      event_date: today,
      location: "Studio",
      agreed_amount: "100.01",
      status: "confirmed",
      staff_ids: [],
    },
    201,
  );
  await call("/bookings/" + booking.id, "PUT", {
    ...booking,
    location: "Updated studio",
    staff_ids: [],
  });
  const input = {
    booking_id: booking.id,
    invoice_date: today,
    due_date: today,
    items: [
      { description: "Photography", quantity: "1", unit_price: "110.01" },
    ],
    discount: "10.00",
    idempotency_key: randomUUID(),
  };
  const invoice = await call("/invoices", "POST", input, 201);
  assert.equal(invoice.total_amount, "100.01");
  assert.equal((await call("/invoices", "POST", input, 201)).id, invoice.id);
  await call(
    "/invoices",
    "POST",
    { ...input, idempotency_key: randomUUID() },
    409,
  );
  await call(
    "/invoices",
    "POST",
    { ...input, tax_amount: "18.00", idempotency_key: randomUUID() },
    400,
  );
  await call(
    `/bookings/${booking.id}`,
    "PUT",
    { ...booking, agreed_amount: 101, staff_ids: [] },
    409,
  );
  assert.equal(Number((await call("/dashboard")).metrics.received), 0);
  const payment = await call(
    "/payments",
    "POST",
    {
      booking_id: booking.id,
      date: today,
      amount: "40.01",
      method: "Cash",
      idempotency_key: randomUUID(),
    },
    201,
  );
  assert.equal((await call("/invoices/" + invoice.id)).balance_amount, "60.00");
  for (const path of [
    `/invoices/${invoice.id}/pdf`,
    `/payments/${payment.id}/receipt/pdf`,
    `/payments/${payment.id}/receipt/pdf`,
  ]) {
    const response = await fetch(base + path, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("content-type").includes("application/pdf"));
    const buffer = Buffer.from(await response.arrayBuffer());
    assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
    assert.ok(buffer.length > 2000);
  }
  assert.equal((await call("/payments")).total, 1);
  await call("/invoices/" + invoice.id + "/void", "POST", {
    reason: "Correct item description",
  });
  const replacement = await call(
    "/invoices",
    "POST",
    { ...input, idempotency_key: randomUUID() },
    201,
  );
  assert.notEqual(replacement.invoice_number, invoice.invoice_number);
  assert.equal(replacement.paid_amount, "40.01");
  assert.equal((await call("/feature-summary")).total_invoiced, "100.01");
  await assert.rejects(() => migrate(client, schema, true), /Rollback refused/);
  const asset = {
    asset_code: "CAM-01",
    name: "Studio camera",
    category: "Cameras",
    purchase_cost: "30000.00",
    condition: "Good",
  };
  const equipment = await call("/equipment", "POST", asset, 201);
  await call("/equipment", "POST", asset, 409);
  await call("/equipment/" + equipment.id, "PUT", {
    ...asset,
    model: "Test camera",
  });
  const assignment = {
    equipment_id: equipment.id,
    booking_id: booking.id,
    assigned_date: today,
    expected_return_date: today,
  };
  const responses = await Promise.all(
    [1, 2].map(() =>
      fetch(base + "/equipment-assignments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(assignment),
      }),
    ),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  const assigned = (await call("/equipment/" + equipment.id)).assignments[0];
  assert.equal(
    (await call("/equipment/" + equipment.id)).availability,
    "Assigned",
  );
  const maintenance = {
    equipment_id: equipment.id,
    maintenance_type: "Cleaning",
    description: "Sensor cleaning",
    service_date: today,
    maintenance_cost: "50.00",
    status: "In progress",
  };
  await call("/equipment-maintenance", "POST", maintenance, 409);
  await call("/equipment/" + equipment.id + "/retire", "PATCH", {}, 400);
  await call("/equipment-assignments/" + assigned.id + "/return", "PATCH", {
    actual_return_date: today,
  });
  await call("/equipment-assignments/" + assigned.id + "/return", "PATCH", {
    actual_return_date: today,
  });
  const service = await call(
    "/equipment-maintenance",
    "POST",
    maintenance,
    201,
  );
  await call("/equipment-assignments", "POST", assignment, 409);
  assert.equal(Number((await call("/dashboard")).metrics.expenses), 0);
  const expense = await call(
    "/equipment-maintenance/" + service.id + "/expense",
    "POST",
    { date: today, method: "Cash" },
    201,
  );
  await call(
    "/equipment-maintenance/" + service.id + "/expense",
    "POST",
    { date: today, method: "Cash" },
    409,
  );
  await call("/expenses/" + expense.id, "DELETE", undefined, 409);
  await call(
    "/expenses/" + expense.id,
    "PUT",
    { ...expense, date: today, amount: "60" },
    409,
  );
  assert.equal(Number((await call("/dashboard")).metrics.expenses), 50);
  await call("/equipment-maintenance/" + service.id, "PATCH", {
    status: "Completed",
  });
  const nextService = await call(
    "/equipment-maintenance",
    "POST",
    { ...maintenance, status: "Completed", description: "Second service" },
    201,
  );
  const existing = await call(
    "/expenses",
    "POST",
    {
      date: today,
      category: "Equipment",
      description: "Second service",
      amount: "50",
      method: "UPI",
    },
    201,
  );
  await call(
    "/equipment-maintenance/" + nextService.id + "/expense",
    "POST",
    { existing_expense_id: existing.id },
    201,
  );
  assert.equal((await call("/expenses")).total, 2);
  await call("/equipment/" + equipment.id + "/retire", "PATCH", {});
  await call("/equipment-assignments", "POST", assignment, 409);
  const summary = await call("/feature-summary");
  assert.equal(summary.total_equipment, 1);
  assert.equal(summary.invoice_outstanding, "60.00");
  assert.equal(Number((await call("/dashboard")).metrics.received), 40.01);
  const staff = await call(
    "/users",
    "POST",
    {
      name: "Feature Staff",
      email: "feature-staff@example.test",
      role: "staff",
    },
    201,
  );
  const temp = (
    await call("/auth/login", "POST", {
      email: staff.email,
      password: staff.temporary_password,
    })
  ).token;
  await call(
    "/auth/change-password",
    "POST",
    { current_password: staff.temporary_password, new_password: password },
    200,
    temp,
  );
  const staffToken = (
    await call("/auth/login", "POST", { email: staff.email, password })
  ).token;
  for (const path of [
    "/invoices",
    "/equipment",
    "/equipment-assignments",
    "/equipment-maintenance",
    `/payments/${payment.id}/receipt/pdf`,
  ])
    await call(path, "GET", undefined, 403, staffToken);
  console.log(
    "PASS: migration/rerun/rollback guards, exact invoice totals, unique invoices, invoice/receipt PDFs, no duplicate receipts, void/reissue, equipment edit/retire/history, concurrent overlap prevention, returns, maintenance/expense links, unchanged cash totals, role checks.",
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
