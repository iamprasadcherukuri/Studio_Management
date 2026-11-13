// End-to-end API checks use a temporary schema; studio records are never modified.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
const schema = "studio_test_" + randomBytes(6).toString("hex");
assert.match(schema, /^studio_test_[a-f0-9]{12}$/);
const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
await database.connect();
let server, pool;
try {
  const sql = (
    await readFile(new URL("../database/schema.sql", import.meta.url), "utf8")
  ).replace(/\bstudio\b/g, schema);
  await database.query(sql);
  const {migrate}=await import('../database/migrate.js');
  await migrate(database,schema);
  process.env.NODE_ENV = "test";
  process.env.DB_SCHEMA = schema;
  process.env.SETUP_TOKEN = randomBytes(24).toString("hex");
  const { app } = await import("../server.js");
  ({ pool } = await import("../database/pool.js"));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let token = "";
  async function request(
    path,
    { method = "GET", body, status = 200, auth = token } = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
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
  assert.equal((await request("/auth/status")).initialized, false);
  await request("/customers", { status: 401 });
  const password = randomBytes(18).toString("hex");
  const admin = {
    name: "Verification Admin",
    email: "verify@example.test",
    password,
    setup_token: process.env.SETUP_TOKEN,
  };
  await request("/auth/setup", { method: "POST", body: admin, status: 201 });
  await request("/auth/setup", { method: "POST", body: admin, status: 409 });
  await request("/auth/login", {
    method: "POST",
    body: { email: admin.email, password: "invalid" },
    status: 401,
  });
  token = (await request("/auth/login", { method: "POST", body: admin })).token;
  const customer = await request("/customers", {
    method: "POST",
    body: { name: "Test Customer", mobile: "9876543210" },
    status: 201,
  });
  const pkg = await request("/packages", {
    method: "POST",
    body: { name: "Test Package", amount: 10000 },
    status: 201,
  });
  const staff = await request("/staff", {
    method: "POST",
    body: { name: "Test Photographer" },
    status: 201,
  });
  const lookups = await request("/lookups");
  const booking = await request("/bookings", {
    method: "POST",
    body: {
      customer_id: customer.id,
      event_type_id: lookups.event_types[0].id,
      package_id: pkg.id,
      event_date: "2026-11-15",
      location: "Test Venue",
      agreed_amount: 10000,
      status: "confirmed",
      staff_ids: [staff.id],
    },
    status: 201,
  });
  await request(`/customers/${customer.id}`, { method: "DELETE", status: 409 });
  const payment = {
    booking_id: booking.id,
    date: "2026-11-13",
    amount: 3000,
    method: "UPI",
    idempotency_key: randomUUID(),
  };
  const receipt = await request("/payments", {
    method: "POST",
    body: payment,
    status: 201,
  });
  assert.equal(
    (await request("/payments", { method: "POST", body: payment, status: 201 }))
      .id,
    receipt.id,
  );
  await request("/payments", {
    method: "POST",
    body: { ...payment, amount: 3001 },
    status: 400,
  });
  await request("/payments", {
    method: "POST",
    body: { ...payment, idempotency_key: randomUUID(), amount: 7001 },
    status: 400,
  });
  // Two competing receipts cannot overdraw the remaining balance.
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      fetch(base + "/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...payment,
          amount: 4000,
          idempotency_key: randomUUID(),
        }),
      }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 400]);
  let history = await request(`/customers/${customer.id}/history`);
  assert.equal(Number(history[0].paid), 7000);
  assert.equal(history[0].event_date, "2026-11-15");
  assert.equal(Number(history[0].outstanding), 3000);
  assert.deepEqual(history[0].staff_ids, [staff.id]);
  await request(`/bookings/${booking.id}`, {
    method: "PUT",
    body: {
      ...booking,
      agreed_amount: 100,
      status: "confirmed",
      staff_ids: [staff.id],
    },
    status: 400,
  });
  const album = await request("/albums", {
    method: "POST",
    body: {
      booking_id: booking.id,
      album_type: "Wedding",
      size: "12x18",
      pages: 30,
      printing_cost: 500,
      status: "Pending",
    },
    status: 201,
  });
  await request(`/albums/${album.id}`, {
    method: "PUT",
    body: { ...album, status: "Delivered" },
    status: 400,
  });
  await request(`/albums/${album.id}`, {
    method: "PUT",
    body: {
      ...album,
      status: "Delivered",
      actual_delivery: "2026-11-13",
      acknowledgement: "Received by customer",
    },
  });
  const expense = await request("/expenses", {
    method: "POST",
    body: {
      date: "2026-11-13",
      category: "Printing",
      description: "Album production",
      amount: 500,
      method: "Cash",
    },
    status: 201,
  });
  await request(`/expenses/${expense.id}`, {
    method: "PUT",
    body: { ...expense, date: "2026-11-13", amount: 600 },
  });
  const dash = await request("/dashboard");
  assert.equal(Number(dash.metrics.received), 7000);
  assert.equal(Number(dash.metrics.expenses), 600);
  assert.equal(Number(dash.metrics.pending), 3000);
  assert.equal(Number(dash.metrics.pending_albums), 0);
  for (const type of [
    "summary",
    "daily",
    "monthly",
    "yearly",
    "receipts",
    "bookings",
    "outstanding",
    "expenses",
    "categories",
    "albums",
    "customers",
  ])
    assert.ok(
      (await request(`/reports?type=${type}&from=2026-01-01&to=2026-12-31`))
        .data.length,
      `Report ${type}`,
    );
  await request("/settings", {
    method: "PUT",
    body: {
      name: "Test Studio",
      phone: "9876543210",
      email: "studio@example.test",
      address: "Test address",
    },
  });
  const account = await request("/users", {
    method: "POST",
    body: {
      name: "Staff Account",
      email: "staff@example.test",
      role: "staff",
    },
    status: 201,
  });
  assert.ok(account.temporary_password.length >= 12);
  const temporaryLogin = await request("/auth/login", {
    method: "POST",
    body: { email: account.email, password: account.temporary_password },
  });
  const temporaryToken = temporaryLogin.token;
  assert.equal(temporaryLogin.user.must_change_password, true);
  await request("/customers", { auth: temporaryToken, status: 403 });
  await request("/auth/me", { auth: temporaryToken });
  await request("/auth/change-password", {
    method: "POST",
    auth: temporaryToken,
    body: { current_password: "wrong", new_password: password },
    status: 400,
  });
  await request("/auth/change-password", {
    method: "POST",
    auth: temporaryToken,
    body: {
      current_password: account.temporary_password,
      new_password: account.temporary_password,
    },
    status: 400,
  });
  await request("/auth/change-password", {
    method: "POST",
    auth: temporaryToken,
    body: {
      current_password: account.temporary_password,
      new_password: "short",
    },
    status: 400,
  });
  await request("/auth/change-password", {
    method: "POST",
    auth: temporaryToken,
    body: {
      current_password: account.temporary_password,
      new_password: password,
    },
  });
  await request("/customers", { auth: temporaryToken, status: 401 });
  await request("/auth/login", {
    method: "POST",
    body: { email: account.email, password: account.temporary_password },
    status: 401,
  });
  const staffToken = (
    await request("/auth/login", {
      method: "POST",
      body: { email: "staff@example.test", password },
    })
  ).token;
  await request("/customers", { auth: staffToken });
  await request("/albums", { auth: staffToken });
  for (const path of ["/payments", "/expenses", "/reports", "/users"])
    await request(path, { auth: staffToken, status: 403 });
  await request("/settings", {
    auth: staffToken,
    method: "PUT",
    body: {},
    status: 403,
  });
  await request("/users/" + account.id, {
    method: "PATCH",
    body: { active: false },
  });
  await request("/customers", { auth: staffToken, status: 401 });
  await request(`/expenses/${expense.id}`, { method: "DELETE" });
  assert.equal(Number((await request("/dashboard")).metrics.expenses), 0);
  console.log(
    "PASS: setup/login, role enforcement, customers, bookings/staff, duplicate/overpayment/concurrent receipts, albums, expenses, all 11 reports, settings and user revocation.",
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
  // The generated schema is verified above and contains only this run's fixtures.
  await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await database.end();
}
