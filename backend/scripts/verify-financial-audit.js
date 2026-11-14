// All writes use a disposable schema. The existing studio database is fingerprinted READ ONLY.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import pg from "pg";
import jwt from "jsonwebtoken";
import Decimal from "decimal.js";
import PDFDocument from "pdfkit";
import { migrate } from "../database/migrate.js";
const url = new URL(process.env.DATABASE_URL || "");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  process.env.DATABASE_TARGET === "supabase"
)
  throw new Error(
    "Disposable financial audit is restricted to local PostgreSQL",
  );
const schema = "studio_audit_" + randomBytes(6).toString("hex"),
  source = process.env.DB_SCHEMA || "studio";
assert.match(schema, /^studio_audit_[a-f0-9]{12}$/);
assert.match(source, /^[a-z_][a-z0-9_]*$/);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
let server, pool;
const checks = [],
  findings = [];
const eq = (actual, expected, name) => {
  assert.ok(
    new Decimal(actual).eq(expected),
    `${name}: ${actual} != ${expected}`,
  );
  checks.push(name);
};
async function fingerprint() {
  await c.query("BEGIN READ ONLY");
  try {
    const result = {};
    for (const table of [
      "packages",
      "bookings",
      "payments",
      "payment_reversals",
      "invoices",
      "invoice_items",
      "expenses",
      "albums",
      "equipment",
      "equipment_maintenance",
    ])
      result[table] = (
        await c.query(
          `SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS digest FROM "${source}".${table} t`,
        )
      ).rows[0];
    return result;
  } finally {
    await c.query("ROLLBACK");
  }
}
const before = await fingerprint();
try {
  await c.query(
    (
      await readFile(new URL("../database/schema.sql", import.meta.url), "utf8")
    ).replace(/\bstudio\b/g, schema),
  );
  await migrate(c, schema);
  process.env.NODE_ENV = "test";
  process.env.DB_SCHEMA = schema;
  process.env.DATABASE_TARGET = "local";
  const { app } = await import("../server.js");
  ({ pool } = await import("../database/pool.js"));
  const { config } = await import("../config/env.js");
  const user = (
    await c.query(
      "INSERT INTO users(name,email,password_hash,role_id) SELECT 'Audit fixture','audit@example.test','unused',id FROM roles WHERE name='admin' RETURNING id",
    )
  ).rows[0];
  const token = jwt.sign({ sub: user.id, pv: 0 }, config.secret);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function call(path, method = "GET", body, status = 200) {
    if (
      path === "/expenses" &&
      method === "POST" &&
      body &&
      !body.idempotency_key
    )
      body = { ...body, idempotency_key: randomUUID() };
    const response = await fetch(base + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
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
  const dates = (
    await c.query(
      "SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS today,((now() AT TIME ZONE 'Asia/Kolkata')::date-1)::text AS yesterday,((now() AT TIME ZONE 'Asia/Kolkata')::date+1)::text AS tomorrow,(date_trunc('month',now() AT TIME ZONE 'Asia/Kolkata')-interval '1 day')::date::text AS prior_month",
    )
  ).rows[0];
  const customer = await call(
    "/customers",
    "POST",
    { name: "Audit fixture", mobile: "9876543210" },
    201,
  );
  const event = (await call("/lookups")).event_types[0];
  const pkg = await call(
    "/packages",
    "POST",
    { name: "Audit package", amount: "50000" },
    201,
  );
  const bookingData = {
    customer_id: customer.id,
    event_type_id: event.id,
    event_date: dates.tomorrow,
    location: "Audit fixture",
    package_id: pkg.id,
    total_amount: "52000",
    discount_type: "PERCENTAGE",
    discount_value: "10",
    status: "confirmed",
    staff_ids: [],
  };
  const booking = await call("/bookings", "POST", bookingData, 201);
  eq(booking.agreed_amount, "46800", "Booking discount applied once");
  await call(`/packages/${pkg.id}`, "PUT", {
    name: "Audit package",
    amount: "60000",
  });
  eq(
    (await call(`/bookings/${booking.id}`)).total_amount,
    "52000",
    "Package master changes preserve booked gross",
  );
  const payment = (amount, extra = {}) => ({
    booking_id: booking.id,
    date: dates.today,
    amount,
    method: "Cash",
    payment_type: "Partial",
    idempotency_key: randomUUID(),
    ...extra,
  });
  const p1 = await call(
    "/payments",
    "POST",
    payment("5000", { date: dates.yesterday, payment_type: "Advance" }),
    201,
  );
  const originalReceipt = await call(`/payments/${p1.id}/receipt`);
  const p2Input = payment("10000", {
    payment_discount_type: "FIXED",
    payment_discount_value: "2000",
  });
  const p2 = await call("/payments", "POST", p2Input, 201);
  assert.equal((await call("/payments", "POST", p2Input, 201)).id, p2.id);
  checks.push("Payment retry does not duplicate cash/discount");
  await call(
    "/payments",
    "POST",
    payment("8000", {
      payment_discount_type: "PERCENTAGE",
      payment_discount_value: "10",
    }),
    201,
  );
  let state = await call(`/bookings/${booking.id}`);
  eq(
    state.discount_amount,
    "10180",
    "Cumulative booking plus payment discounts",
  );
  eq(state.agreed_amount, "41820", "Net booking after additional discounts");
  eq(state.paid, "23000", "Discounts excluded from cash received");
  eq(
    state.outstanding,
    "18820",
    "Outstanding reconciles gross-discount-net cash",
  );
  const reversal = {
    date: dates.today,
    amount: "3000",
    reason: "Audit fixture refund",
    idempotency_key: randomUUID(),
  };
  const reversed = await call(
    `/payments/${p2.id}/reversals`,
    "POST",
    reversal,
    201,
  );
  assert.equal(
    (await call(`/payments/${p2.id}/reversals`, "POST", reversal, 201)).id,
    reversed.id,
  );
  state = await call(`/bookings/${booking.id}`);
  eq(state.paid, "20000", "Refund reduces cash once");
  eq(state.outstanding, "21820", "Refund restores balance");
  eq(state.discount_amount, "10180", "Refund does not undo agreed discount");
  for (const amount of ["0", "-1", "21820.01"])
    await call("/payments", "POST", payment(amount), 400);
  checks.push("Zero/negative/overpayments rejected");
  await call(
    "/payments",
    "POST",
    payment("21820", { payment_type: "Final" }),
    201,
  );
  eq(
    (await call(`/bookings/${booking.id}`)).outstanding,
    "0",
    "Final payment settles exact balance",
  );
  assert.deepEqual(await call(`/payments/${p1.id}/receipt`), originalReceipt);
  checks.push("Issued receipt values survive later payments/discounts/refunds");
  await call(
    `/bookings/${booking.id}`,
    "PUT",
    {
      ...bookingData,
      total_amount: "10000",
      discount_type: "NONE",
      discount_value: "0",
    },
    400,
  );
  checks.push("Booking cannot be reduced below net cash");
  await call(
    `/bookings/${booking.id}`,
    "PUT",
    { ...bookingData, status: "cancelled" },
    400,
  );
  checks.push("Paid booking cancellation rejected");
  const expenseData = {
    date: dates.today,
    category: "Travel",
    description: "Audit fixture",
    amount: "500",
    method: "Cash",
    booking_id: booking.id,
  };
  await call("/expenses", "POST", expenseData, 201);
  await call(
    "/expenses",
    "POST",
    {
      ...expenseData,
      date: dates.yesterday,
      category: "Salaries",
      amount: "200",
      booking_id: null,
    },
    201,
  );
  const report = (type) =>
    call(`/reports?type=${type}&from=0001-01-01&to=9999-12-31`);
  const sum = (rows) =>
    rows.reduce(
      (n, r) => n.plus(r.amount ?? r.receipts ?? r.outstanding ?? 0),
      new Decimal(0),
    );
  const dashboard = await call("/dashboard"),
    summary = (await report("summary")).data;
  eq(
    dashboard.metrics.received,
    "41820",
    "Dashboard receipts equal net ledger",
  );
  eq(
    dashboard.metrics.pending,
    "0",
    "Dashboard outstanding equals booking ledger",
  );
  eq(
    summary.find((r) => r.category === "Receipts").amount,
    "41820",
    "Summary net receipts",
  );
  eq(
    summary.find((r) => r.category === "Expenses paid").amount,
    "700",
    "Summary paid expenses",
  );
  eq(
    summary.find((r) => r.category === "Net cash balance").amount,
    "41120",
    "Cash balance is receipts less expenses",
  );
  for (const type of ["receipts", "monthly", "daily", "yearly"])
    eq(
      sum((await report(type)).data),
      "41820",
      `${type} reconciles net ledger`,
    );
  eq(
    sum((await report("categories")).data),
    "700",
    "Expense categories reconcile cash expenses",
  );
  eq(
    sum((await report("outstanding")).data),
    dashboard.metrics.pending,
    "Outstanding report reconciles dashboard",
  );
  const history = await call(`/customers/${customer.id}/history`);
  eq(history[0].paid, "41820", "Customer history net receipts");
  const month = dates.today.slice(0, 7);
  const monthChart = dashboard.months.find(
    (r) =>
      r.month ===
      new Date(dates.today + "T12:00:00Z").toLocaleString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
  );
  eq(
    monthChart.revenue,
    (
      await c.query(
        "SELECT coalesce(sum(amount),0) amount FROM payment_ledger WHERE to_char(date,'YYYY-MM')=$1",
        [month],
      )
    ).rows[0].amount,
    "Monthly chart uses payment/reversal dates",
  );
  const todaySummary = (
    await call(`/reports?type=summary&from=${dates.today}&to=${dates.today}`)
  ).data;
  eq(
    todaySummary.find((r) => r.category === "Receipts").amount,
    "36820",
    "Daily cash excludes yesterday and includes today refund",
  );
  eq(
    todaySummary.find((r) => r.category === "Expenses paid").amount,
    "500",
    "Expense report uses paid expense date",
  );
  assert.equal(
    (await call(`/reports?type=bookings&from=${dates.today}&to=${dates.today}`))
      .data.length,
    0,
  );
  checks.push(
    "Booking reports use event date rather than creation/payment date",
  );
  const boundary = await call(
    "/bookings",
    "POST",
    {
      ...bookingData,
      package_id: null,
      total_amount: "1000",
      discount_type: "NONE",
      discount_value: 0,
    },
    201,
  );
  const priorPayment = await call(
    "/payments",
    "POST",
    payment("100", { booking_id: boundary.id, date: dates.prior_month }),
    201,
  );
  await call(
    `/payments/${priorPayment.id}/reversals`,
    "POST",
    {
      date: dates.today,
      amount: "100",
      reason: "Cross-month refund fixture",
      idempotency_key: randomUUID(),
    },
    201,
  );
  eq(
    sum(
      (
        await call(
          `/reports?type=receipts&from=${dates.prior_month}&to=${dates.prior_month}`,
        )
      ).data,
    ),
    "100",
    "Prior month retains original collection",
  );
  eq(
    (
      await call(`/reports?type=summary&from=${dates.today}&to=${dates.today}`)
    ).data.find((r) => r.category === "Receipts").amount,
    "36720",
    "Refund reduces its own period rather than original payment period",
  );
  eq(
    (await call("/dashboard")).metrics.received,
    "41820",
    "Cross-month full refund leaves all-time collections unchanged",
  );
  const otherData = {
    ...bookingData,
    package_id: null,
    total_amount: "1000",
    discount_type: "NONE",
    discount_value: 0,
  };
  const invoiceBooking = await call("/bookings", "POST", otherData, 201);
  await call(
    "/payments",
    "POST",
    payment("100", { booking_id: invoiceBooking.id }),
    201,
  );
  const invoice = await call(
    "/invoices",
    "POST",
    {
      booking_id: invoiceBooking.id,
      invoice_date: dates.today,
      due_date: dates.today,
      items: [
        { description: "Audit fixture", quantity: "1", unit_price: "1000" },
      ],
      discount: "0",
      idempotency_key: randomUUID(),
    },
    201,
  );
  eq(invoice.total_amount, "1000", "Invoice net equals authoritative booking");
  const { renderPdf } = await import("../services/pdf.js");
  async function pdfText(data) {
    const texts = [],
      original = PDFDocument.prototype.text;
    PDFDocument.prototype.text = function (value, ...args) {
      texts.push(String(value));
      return original.call(this, value, ...args);
    };
    try {
      await renderPdf("invoice", data);
      return texts;
    } finally {
      PDFDocument.prototype.text = original;
    }
  }
  const pdfBefore = await pdfText(await call(`/invoices/${invoice.id}`));
  await call(
    "/payments",
    "POST",
    payment("200", { booking_id: invoiceBooking.id }),
    201,
  );
  const laterInvoice = await call(`/invoices/${invoice.id}`),
    pdfAfter = await pdfText(laterInvoice);
  eq(
    laterInvoice.paid_amount,
    "300",
    "Invoice live paid amount reconciles ledger",
  );
  assert.deepEqual(pdfAfter, pdfBefore);
  checks.push("F02 original invoice PDF financial text remains unchanged");
  await call(
    "/payments",
    "POST",
    payment("100", {
      booking_id: invoiceBooking.id,
      payment_discount_type: "FIXED",
      payment_discount_value: "100",
    }),
    409,
  );
  checks.push("Issued invoice prevents unapproved total change");
  const lineBooking = await call(
    "/bookings",
    "POST",
    { ...otherData, total_amount: ".01" },
    201,
  );
  const rounded = await call(
    "/invoices",
    "POST",
    {
      booking_id: lineBooking.id,
      invoice_date: dates.today,
      due_date: dates.today,
      items: [
        {
          description: "Rounding fixture",
          quantity: "0.500",
          unit_price: "0.01",
        },
      ],
      idempotency_key: randomUUID(),
    },
    201,
  );
  eq(
    rounded.items[0].line_total,
    ".01",
    "Invoice line rounds half up before subtotal",
  );
  const equipment = await call(
    "/equipment",
    "POST",
    {
      asset_code: "AUDIT-01",
      name: "Audit fixture",
      category: "Camera",
      purchase_cost: "30000",
      condition: "Good",
    },
    201,
  );
  const maintenance = await call(
    "/equipment-maintenance",
    "POST",
    {
      equipment_id: equipment.id,
      maintenance_type: "Service",
      service_date: dates.today,
      description: "Audit fixture",
      maintenance_cost: "500",
      status: "Completed",
    },
    201,
  );
  eq(
    (await call("/dashboard")).metrics.expenses,
    "700",
    "Inventory and maintenance estimates are not paid expenses",
  );
  const linkedExpense = await call(
    `/equipment-maintenance/${maintenance.id}/expense`,
    "POST",
    { date: dates.today, method: "Cash" },
    201,
  );
  await call(
    `/equipment-maintenance/${maintenance.id}/expense`,
    "POST",
    { date: dates.today, method: "Cash" },
    409,
  );
  eq(
    (await call("/dashboard")).metrics.expenses,
    "1200",
    "Maintenance cash expense counted once",
  );
  await call(
    `/expenses/${linkedExpense.id}`,
    "PUT",
    { ...expenseData, booking_id: null, category: "Equipment", amount: "600" },
    409,
  );
  await call(`/expenses/${linkedExpense.id}`, "DELETE", undefined, 409);
  checks.push("Linked maintenance expense cannot be edited or deleted");
  // Reproduce unsafe mutations only after validating the healthy ledger above.
  const edited = await call(`/bookings/${booking.id}`, "PUT", {
    ...bookingData,
    discount_type: "NONE",
    discount_value: "0",
  });
  const granted = (
    await c.query(
      "SELECT sum(payment_discount_amount) amount FROM payments WHERE booking_id=$1",
      [booking.id],
    )
  ).rows[0].amount;
  assert.equal(edited.discount_amount, granted);
  assert.equal(edited.booking_discount_amount, "0.00");
  checks.push("F01 granted payment discounts survive booking edits");
  const sql = (
    await readFile(
      new URL("../database/financial_audit.sql", import.meta.url),
      "utf8",
    )
  ).replace(/\bstudio\b/g, schema);
  const results = await c.query(sql),
    fixtureAudit = results.find((r) => r.rows?.[0]?.financial_audit)?.rows[0]
      .financial_audit;
  assert.deepEqual(fixtureAudit.violations, []);
  checks.push(
    "Read-only SQL confirms the corrected financial records reconcile",
  );
  for (let i = 0; i < 2; i++) {
    const large = await call(
      "/bookings",
      "POST",
      { ...otherData, total_amount: "6000000000" },
      201,
    );
    await call(
      "/invoices",
      "POST",
      {
        booking_id: large.id,
        invoice_date: dates.today,
        due_date: dates.today,
        items: [
          {
            description: "Aggregate capacity fixture",
            quantity: "10",
            unit_price: "600000000",
          },
        ],
        idempotency_key: randomUUID(),
      },
      201,
    );
  }
  const aggregate = (
    await c.query(
      "SELECT sum(total_amount)::text amount FROM invoices WHERE status='Issued'",
    )
  ).rows[0].amount;
  assert.ok(new Decimal(aggregate).gt("9999999999.99"));
  eq(
    (await call("/feature-summary")).total_invoiced,
    aggregate,
    "F03 large aggregate remains exact",
  );
  const after = await fingerprint();
  assert.deepEqual(after, before);
  checks.push(
    "Existing source financial records unchanged (row counts and fingerprints)",
  );
  const result = {
    status: "financial regressions passed with no open reproduced findings",
    checks,
    findings,
    fixture_reconciliation: fixtureAudit,
    source_unchanged: true,
  };
  await mkdir(new URL("../../test-results/", import.meta.url), {
    recursive: true,
  });
  await writeFile(
    new URL(
      "../../test-results/financial-audit-regressions.json",
      import.meta.url,
    ),
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        checks_passed: checks.length,
        confirmed_findings: findings,
        source_unchanged: true,
      },
      null,
      2,
    ),
  );
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  if (pool) await pool.end();
  await c.query("ROLLBACK");
  await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await c.end();
}
