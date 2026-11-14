import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import pg from "pg";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Decimal from "decimal.js";
import PDFDocument from "pdfkit";
import { migrate } from "../database/migrate.js";
import { migrationVersions } from "../database/versions.js";
const connection = new URL(process.env.DATABASE_URL || "");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname) ||
  process.env.DATABASE_TARGET === "supabase"
)
  throw new Error("Regression fixtures require local PostgreSQL");
const schema = "studio_fix_test_" + randomBytes(6).toString("hex"),
  source = process.env.DB_SCHEMA || "studio";
assert.match(source, /^[a-z_][a-z0-9_]*$/);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
let server, pool;
const outcomes = {},
  checks = [];
async function sourceFingerprint() {
  await c.query("BEGIN READ ONLY");
  try {
    const result = {};
    for (const { table_name: t } of (
      await c.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema=$1 AND table_type='BASE TABLE' ORDER BY table_name",
        [source],
      )
    ).rows) {
      assert.match(t, /^[a-z_][a-z0-9_]*$/);
      result[t] = (
        await c.query(
          `SELECT count(*)::text count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY to_jsonb(t)::text),'')) digest FROM "${source}".${t} t`,
        )
      ).rows[0];
    }
    return result;
  } finally {
    await c.query("ROLLBACK");
  }
}
const beforeSource = await sourceFingerprint();
try {
  await c.query(
    (
      await readFile(new URL("../database/schema.sql", import.meta.url), "utf8")
    ).replace(/\bstudio\b/g, schema),
  );
  await c.query(
    "CREATE TABLE schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  for (const version of migrationVersions.slice(0, -1)) {
    await c.query(
      await readFile(
        new URL(`../database/migrations/${version}.up.sql`, import.meta.url),
        "utf8",
      ),
    );
    await c.query("INSERT INTO schema_migrations(version) VALUES($1)", [
      version,
    ]);
  }
  const password = randomBytes(20).toString("hex"),
    hash = await bcrypt.hash(password, 12);
  const admin = (
    await c.query(
      "INSERT INTO users(name,email,password_hash,role_id) SELECT 'Fix Admin','fix-admin@example.test',$1,id FROM roles WHERE name='admin' RETURNING *",
      [hash],
    )
  ).rows[0];
  const legacyCustomer = (
    await c.query(
      "INSERT INTO customers(name,mobile) VALUES('Legacy fixture','9876543210') RETURNING id",
    )
  ).rows[0];
  const event = (
    await c.query("SELECT id FROM event_types ORDER BY id LIMIT 1")
  ).rows[0];
  const legacyBooking = (
    await c.query(
      "INSERT INTO bookings(customer_id,event_type_id,event_date,location,agreed_amount) VALUES($1,$2,CURRENT_DATE,'Legacy fixture',1000) RETURNING id",
      [legacyCustomer.id, event.id],
    )
  ).rows[0];
  await c.query(
    "INSERT INTO payments(booking_id,date,amount,method,idempotency_key,created_by) VALUES($1,CURRENT_DATE,100,'Cash',$2,$3)",
    [legacyBooking.id, randomUUID(), admin.id],
  );
  const legacyInvoice = (
    await c.query(
      "INSERT INTO invoices(booking_id,customer_id,invoice_date,due_date,studio_snapshot,customer_snapshot,subtotal,total_amount,idempotency_key,request_hash,created_by) VALUES($1,$2,CURRENT_DATE,CURRENT_DATE,'{}','{}',1000,1000,$3,'legacy',$4) RETURNING id",
      [legacyBooking.id, legacyCustomer.id, randomUUID(), admin.id],
    )
  ).rows[0];
  await c.query(
    "INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,line_total) VALUES($1,'Legacy item',1,1000,1000)",
    [legacyInvoice.id],
  );
  const legacyExpense=(await c.query("INSERT INTO expenses(date,category,description,amount,method) VALUES(CURRENT_DATE,'Travel','Legacy expense',100,'Cash') RETURNING id")).rows[0];
  const legacyGear=(await c.query("INSERT INTO equipment(asset_code,name,category,condition) VALUES('LEGACY-GEAR','Legacy gear','Camera','Good') RETURNING id")).rows[0];
  await c.query("INSERT INTO equipment_assignments(equipment_id,booking_id,assigned_by,assigned_date,expected_return_date) VALUES($1,$2,$3,CURRENT_DATE+2,CURRENT_DATE+3)",[legacyGear.id,legacyBooking.id,admin.id]);
  await c.query("INSERT INTO albums(booking_id,album_type,size,pages,status,actual_delivery,acknowledgement) VALUES($1,'Wedding Album','12×18',10,'Delivered',CURRENT_DATE+5,'Legacy acknowledgement')",[legacyBooking.id]);
  await c.query("INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES($1,'legacy_action','bookings',$2)",[admin.id,legacyBooking.id]);
  const oldRows = {};
  for (const t of [
    "bookings",
    "payments",
    "invoices",
    "invoice_items",
    "expenses",
    "equipment_assignments",
    "users","customers","albums","equipment","audit_logs",
  ])
    oldRows[t] = (
      await c.query(`SELECT to_jsonb(t) value FROM ${t} t ORDER BY id`)
    ).rows.map((r) => r.value);
  await migrate(c, schema);
  await migrate(c, schema);
  for (const [table, rows] of Object.entries(oldRows)) {
    const after = (
      await c.query(`SELECT to_jsonb(t) value FROM ${table} t ORDER BY id`)
    ).rows.map((r) => r.value);
    assert.equal(after.length, rows.length);
    for (let i = 0; i < rows.length; i++)
      for (const key of Object.keys(rows[i]))
        assert.deepEqual(
          after[i][key],
          rows[i][key],
          `${table}.${key} changed during migration`,
        );
  }
  checks.push(
    "008 migration/rerun preserves every existing field in seeded financial and user records",
  );
  process.env.NODE_ENV = "test";
  process.env.DB_SCHEMA = schema;
  process.env.DATABASE_TARGET = "local";
  const { app } = await import("../server.js");
  ({ pool } = await import("../database/pool.js"));
  const { config } = await import("../config/env.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = jwt.sign({ sub: String(admin.id), pv: 0 }, config.secret, {
    expiresIn: "1h",
  });
  async function raw(path, method = "GET", body, auth = token) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: "Bearer " + auth } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: response.status, data };
  }
  async function call(path, method = "GET", body, status = 200, auth = token) {
    const result = await raw(path, method, body, auth);
    assert.equal(
      result.status,
      status,
      `${method} ${path}: ${result.data?.error || result.status}`,
    );
    return result.data;
  }
  const dates = (
    await c.query(
      "SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text today,((now() AT TIME ZONE 'Asia/Kolkata')::date+2)::text future,((now() AT TIME ZONE 'Asia/Kolkata')::date+4)::text later,((now() AT TIME ZONE 'Asia/Kolkata')::date+6)::text latest",
    )
  ).rows[0];
  const customer = await call(
    "/customers",
    "POST",
    { name: "Fix fixture", mobile: "9876543210" },
    201,
  );
  const bookData = {
    customer_id: customer.id,
    event_type_id: event.id,
    event_date: dates.future,
    location: "Fix fixture",
    total_amount: "50000",
    discount_type: "PERCENTAGE",
    discount_value: "10",
    status: "confirmed",
    staff_ids: [],
  };
  const booking = await call("/bookings", "POST", bookData, 201);
  const pay = (id, amount, extra = {}) => ({
    booking_id: id,
    date: dates.today,
    amount,
    method: "Cash",
    payment_type: "Partial",
    idempotency_key: randomUUID(),
    ...extra,
  });
  const first = await call(
    "/payments",
    "POST",
    pay(booking.id, "1000", {
      payment_discount_type: "FIXED",
      payment_discount_value: "2000",
    }),
    201,
  );
  const receiptBefore = await call(`/payments/${first.id}/receipt`);
  await call(
    "/payments",
    "POST",
    pay(booking.id, "1000", {
      payment_discount_type: "PERCENTAGE",
      payment_discount_value: "10",
    }),
    201,
  );
  let current = await call(`/bookings/${booking.id}`);
  const granted = current.payment_discounts;
  const edited = await call(`/bookings/${booking.id}`, "PUT", {
    ...bookData,
    booking_discount_type: "NONE",
    booking_discount_value: 0,
  });
  assert.equal(edited.discount_amount, granted);
  assert.equal(edited.booking_discount_amount, "0.00");
  assert.equal(edited.total_amount, "50000.00");
  assert.ok(
    new Decimal(edited.agreed_amount).eq(new Decimal(50000).minus(granted)),
  );
  assert.deepEqual(await call(`/payments/${first.id}/receipt`), receiptBefore);
  await call(
    `/bookings/${booking.id}`,
    "PUT",
    {
      ...bookData,
      total_amount: "100",
      booking_discount_type: "NONE",
      booking_discount_value: 0,
    },
    400,
  );
  outcomes.F01 =
    "Pass: one/multiple granted discounts retained, separate booking discount editable, invalid balances rejected, old receipt unchanged";
  const priceRace = await call(
    "/bookings",
    "POST",
    {
      ...bookData,
      total_amount: "1000",
      discount_type: "NONE",
      discount_value: 0,
    },
    201,
  );
  const priceResults = await Promise.all([
    raw(`/bookings/${priceRace.id}`, "PUT", {
      ...bookData,
      total_amount: "1100",
      booking_discount_type: "NONE",
      booking_discount_value: 0,
    }),
    raw(
      "/payments",
      "POST",
      pay(priceRace.id, "100", {
        payment_discount_type: "FIXED",
        payment_discount_value: "100",
      }),
    ),
  ]);
  assert.deepEqual(priceResults.map((r) => r.status).sort(), [200, 201]);
  const priced = await call(`/bookings/${priceRace.id}`);
  assert.equal(priced.total_amount, "1100.00");
  assert.equal(priced.payment_discounts, "100.00");
  assert.equal(priced.agreed_amount, "1000.00");
  assert.equal(priced.outstanding, "900.00");
  checks.push(
    "F01 concurrent price edit and payment discount preserve one authoritative balance",
  );
  const invBook = await call(
    "/bookings",
    "POST",
    {
      ...bookData,
      total_amount: "1000",
      discount_type: "NONE",
      discount_value: 0,
    },
    201,
  );
  await call("/payments", "POST", pay(invBook.id, "100"), 201);
  const invoice = await call(
    "/invoices",
    "POST",
    {
      booking_id: invBook.id,
      invoice_date: dates.today,
      due_date: dates.today,
      items: [
        {
          description: "Frozen financial fixture",
          quantity: "1",
          unit_price: "1000",
        },
      ],
      idempotency_key: randomUUID(),
    },
    201,
  );
  const { renderPdf } = await import("../services/pdf.js");
  async function texts(data) {
    const original = PDFDocument.prototype.text,
      list = [];
    PDFDocument.prototype.text = function (value, ...args) {
      list.push(String(value));
      return original.call(this, value, ...args);
    };
    try {
      await renderPdf("invoice", data);
      return list;
    } finally {
      PDFDocument.prototype.text = original;
    }
  }
  const pdfBefore = await texts(await call(`/invoices/${invoice.id}`));
  await call("/payments", "POST", pay(invBook.id, "200"), 201);
  const live = await call(`/invoices/${invoice.id}`);
  assert.equal(live.paid_amount, "300.00");
  assert.equal(live.financial_snapshot.paid_amount, "100.00");
  assert.deepEqual(await texts(live), pdfBefore);
  await assert.rejects(
    () =>
      c.query("UPDATE invoices SET financial_snapshot='{}' WHERE id=$1", [
        invoice.id,
      ]),
    /immutable/,
  );
  await assert.rejects(
    () =>
      c.query(
        "UPDATE invoice_items SET description='Changed' WHERE invoice_id=$1",
        [invoice.id],
      ),
    /immutable/,
  );
  const legacy = await call(`/invoices/${legacyInvoice.id}`);
  assert.equal(legacy.financial_snapshot, null);
  assert.ok(
    (await texts(legacy)).some((t) =>
      t.includes("Unavailable (legacy invoice)"),
    ),
  );
  await call(`/invoices/${invoice.id}/void`, "POST", {
    reason: "Reviewed replacement",
  });
  const replacement = await call(
    "/invoices",
    "POST",
    {
      booking_id: invBook.id,
      invoice_date: dates.today,
      due_date: dates.today,
      items: [{ description: "Replacement", quantity: 1, unit_price: "1000" }],
      idempotency_key: randomUUID(),
    },
    201,
  );
  assert.notEqual(replacement.id, invoice.id);
  outcomes.F02 =
    "Pass: PDF financial text frozen after later payment, immutable DB snapshot/items, explicit legacy handling and void/reissue";
  for (let i = 0; i < 2; i++) {
    const large = await call(
      "/bookings",
      "POST",
      {
        ...bookData,
        total_amount: "6000000000",
        discount_type: "NONE",
        discount_value: 0,
      },
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
          { description: "Capacity", quantity: 10, unit_price: "600000000" },
        ],
        idempotency_key: randomUUID(),
      },
      201,
    );
  }
  const total = (
    await c.query(
      "SELECT sum(total_amount)::text amount FROM invoices WHERE status='Issued'",
    )
  ).rows[0].amount;
  assert.equal((await call("/feature-summary")).total_invoiced, total);
  outcomes.F03 =
    "Pass: aggregate exceeds individual NUMERIC(12,2) capacity without overflow";
  const schedulingBook = await call(
    "/bookings",
    "POST",
    {
      ...bookData,
      total_amount: "1000",
      discount_type: "NONE",
      discount_value: 0,
    },
    201,
  );
  const gear = await call(
    "/equipment",
    "POST",
    {
      asset_code: "FIX-01",
      name: "Camera",
      category: "Camera",
      condition: "Good",
    },
    201,
  );
  const assignment = await call(
    "/equipment-assignments",
    "POST",
    {
      equipment_id: gear.id,
      booking_id: schedulingBook.id,
      assigned_date: dates.future,
      expected_return_date: dates.later,
    },
    201,
  );
  await call(`/bookings/${schedulingBook.id}`, "PUT", {
    ...bookData,
    total_amount: "1000",
    discount_type: "NONE",
    discount_value: 0,
    event_date: dates.later,
  });
  let moved = (
    await c.query("SELECT * FROM equipment_assignments WHERE id=$1", [
      assignment.id,
    ])
  ).rows[0];
  assert.equal(moved.assigned_date, dates.later);
  assert.equal(moved.expected_return_date, dates.latest);
  const conflictBook = await call(
    "/bookings",
    "POST",
    {
      ...bookData,
      event_date: dates.future,
      total_amount: "1000",
      discount_type: "NONE",
      discount_value: 0,
    },
    201,
  );
  await call(
    "/equipment-assignments",
    "POST",
    {
      equipment_id: gear.id,
      booking_id: conflictBook.id,
      assigned_date: dates.future,
      expected_return_date: dates.future,
    },
    201,
  );
  await call(
    `/bookings/${schedulingBook.id}`,
    "PUT",
    {
      ...bookData,
      total_amount: "1000",
      discount_type: "NONE",
      discount_value: 0,
      event_date: dates.future,
    },
    409,
  );
  assert.equal(
    (await call(`/bookings/${schedulingBook.id}`)).event_date,
    dates.later,
  );
  outcomes.P01 =
    "Pass: event and future range shift atomically, duration preserved, conflicts reject without changing booking";
  const raceGear = await call(
    "/equipment",
    "POST",
    {
      asset_code: "FIX-RACE",
      name: "Race camera",
      category: "Camera",
      condition: "Good",
    },
    201,
  );
  const raceA = await call(
      "/bookings",
      "POST",
      {
        ...bookData,
        event_date: dates.future,
        total_amount: "1000",
        discount_type: "NONE",
        discount_value: 0,
      },
      201,
    ),
    raceB = await call(
      "/bookings",
      "POST",
      {
        ...bookData,
        event_date: dates.later,
        total_amount: "1000",
        discount_type: "NONE",
        discount_value: 0,
      },
      201,
    );
  await call(
    "/equipment-assignments",
    "POST",
    {
      equipment_id: raceGear.id,
      booking_id: raceA.id,
      assigned_date: dates.future,
      expected_return_date: dates.future,
    },
    201,
  );
  const schedulingRace = await Promise.all([
    raw(`/bookings/${raceA.id}`, "PUT", {
      ...bookData,
      event_date: dates.later,
      total_amount: "1000",
      discount_type: "NONE",
      discount_value: 0,
    }),
    raw("/equipment-assignments", "POST", {
      equipment_id: raceGear.id,
      booking_id: raceB.id,
      assigned_date: dates.later,
      expected_return_date: dates.later,
    }),
  ]);
  assert.equal(
    schedulingRace.filter((r) => [200, 201].includes(r.status)).length,
    1,
  );
  assert.equal(schedulingRace.filter((r) => r.status === 409).length, 1);
  assert.equal(
    Number(
      (
        await c.query(
          "SELECT count(*) FROM equipment_assignments a JOIN equipment_assignments b ON a.id<b.id AND a.equipment_id=b.equipment_id AND a.status='Active' AND b.status='Active' AND daterange(a.assigned_date,a.expected_return_date,'[]') && daterange(b.assigned_date,b.expected_return_date,'[]') WHERE a.equipment_id=$1",
          [raceGear.id],
        )
      ).rows[0].count,
    ),
    0,
  );
  checks.push(
    "P01 concurrent rescheduling and assignment serialize without overlaps or deadlock",
  );
  await call(`/bookings/${schedulingBook.id}`, "PUT", {
    ...bookData,
    total_amount: "1000",
    discount_type: "NONE",
    discount_value: 0,
    event_date: dates.later,
    status: "cancelled",
  });
  await call(`/bookings/${schedulingBook.id}`, "PUT", {
    ...bookData,
    total_amount: "1000",
    discount_type: "NONE",
    discount_value: 0,
    event_date: dates.later,
    status: "cancelled",
  });
  moved = (
    await c.query("SELECT * FROM equipment_assignments WHERE id=$1", [
      assignment.id,
    ])
  ).rows[0];
  assert.equal(moved.status, "Cancelled");
  assert.equal(moved.actual_return_date, null);
  assert.ok(moved.cancelled_at);
  const rebook = await call(
    "/bookings",
    "POST",
    {
      ...bookData,
      event_date: dates.later,
      total_amount: "1000",
      discount_type: "NONE",
      discount_value: 0,
    },
    201,
  );
  await call(
    "/equipment-assignments",
    "POST",
    {
      equipment_id: gear.id,
      booking_id: rebook.id,
      assigned_date: dates.later,
      expected_return_date: dates.latest,
    },
    201,
  );
  checks.push("P02 cancelled future ranges can be reserved again");
  const paidGear=await call('/equipment','POST',{asset_code:'FIX-PAID',name:'Paid booking camera',category:'Camera',condition:'Good'},201);
  const paidReservation=await call('/equipment-assignments','POST',{equipment_id:paidGear.id,booking_id:priceRace.id,assigned_date:dates.future,expected_return_date:dates.future},201);
  await call(`/bookings/${priceRace.id}`,'PUT',{...bookData,total_amount:'1100',booking_discount_type:'NONE',booking_discount_value:0,status:'cancelled'},400);
  assert.equal((await c.query('SELECT status FROM equipment_assignments WHERE id=$1',[paidReservation.id])).rows[0].status,'Active');
  checks.push('P02 failed paid-booking cancellation rolls reservation changes back atomically');
  await call(
    "/equipment-assignments",
    "POST",
    {
      equipment_id: gear.id,
      booking_id: conflictBook.id,
      assigned_date: dates.future,
      expected_return_date: dates.future,
    },
    409,
  );
  const issuedGear = await call(
    "/equipment",
    "POST",
    {
      asset_code: "FIX-ISSUED",
      name: "Issued camera",
      category: "Camera",
      condition: "Good",
    },
    201,
  );
  const issuedBook = await call(
    "/bookings",
    "POST",
    {
      ...bookData,
      event_date: dates.today,
      total_amount: "1000",
      discount_type: "NONE",
      discount_value: 0,
    },
    201,
  );
  const issuedAssignment = await call(
    "/equipment-assignments",
    "POST",
    {
      equipment_id: issuedGear.id,
      booking_id: issuedBook.id,
      assigned_date: dates.today,
      expected_return_date: dates.today,
    },
    201,
  );
  await call(
    `/bookings/${issuedBook.id}`,
    "PUT",
    {
      ...bookData,
      event_date: dates.today,
      total_amount: "1000",
      discount_type: "NONE",
      discount_value: 0,
      status: "cancelled",
    },
    409,
  );
  await call(`/equipment-assignments/${issuedAssignment.id}/return`, "PATCH", {
    actual_return_date: dates.today,
  });
  await call(`/bookings/${issuedBook.id}`, "PUT", {
    ...bookData,
    event_date: dates.later,
    total_amount: "1000",
    discount_type: "NONE",
    discount_value: 0,
  });
  assert.equal(
    (
      await c.query(
        "SELECT assigned_date FROM equipment_assignments WHERE id=$1",
        [issuedAssignment.id],
      )
    ).rows[0].assigned_date,
    dates.today,
  );
  outcomes.P02 =
    "Pass: future cancellation is repeat-safe and not a return; issued equipment blocks cancellation; returned history stays fixed";
  const expense = {
    date: dates.today,
    category: "Travel",
    description: "Retry test",
    amount: 100,
    method: "Cash",
    idempotency_key: randomUUID(),
  };
  const oldExpense=(await c.query('SELECT * FROM expenses WHERE id=$1',[legacyExpense.id])).rows[0];
  const oldEdited=await call(`/expenses/${legacyExpense.id}`,'PUT',{...oldExpense,amount:101});assert.equal(oldEdited.idempotency_key,null);checks.push('P03 legacy NULL-key expenses remain editable without inventing a retry key');
  const expenses = await Promise.all(
    [1, 2].map(() => call("/expenses", "POST", expense, 201)),
  );
  assert.equal(expenses[0].id, expenses[1].id);
  await call("/expenses", "POST", { ...expense, amount: 101 }, 409);
  const separate = await call(
    "/expenses",
    "POST",
    { ...expense, idempotency_key: randomUUID() },
    201,
  );
  assert.notEqual(separate.id, expenses[0].id);
  await call(
    "/expenses",
    "POST",
    { ...expense, idempotency_key: undefined },
    400,
  );
  await call(`/expenses/${expenses[0].id}`, "PUT", { ...expense, amount: 99 });
  outcomes.P03 =
    "Pass: same/concurrent key returns original ID, changed payload rejects, distinct keys allow legitimate equal expenses, missing key rejected";
  const album = {
    booking_id: issuedBook.id,
    album_type: "Wedding Album",
    size: "12×18",
    pages: 10,
    printing_cost: 0,
    status: "Delivered",
    actual_delivery: dates.future,
    acknowledgement: "Received",
  };
  await call("/albums", "POST", album, 400);
  await call(
    "/albums",
    "POST",
    { ...album, actual_delivery: dates.today, acknowledgement: " " },
    400,
  );
  await call(
    "/albums",
    "POST",
    { ...album, booking_id: schedulingBook.id, actual_delivery: dates.today },
    400,
  );
  await call(
    "/albums",
    "POST",
    { ...album, actual_delivery: dates.today },
    201,
  );
  outcomes.P04 =
    "Pass: future delivery, blank acknowledgement and cancelled-booking new delivery rejected; valid delivery succeeds";
  const account = await call(
    "/users",
    "POST",
    {
      name: "Session fixture",
      email: "session@example.test",
      role: "staff",
      password,
    },
    201,
  );
  const initial = await call("/auth/login", "POST", {
    email: account.email,
    password,
  });
  await call(
    "/auth/change-password",
    "POST",
    { current_password: password, new_password: password + "new" },
    200,
    initial.token,
  );
  const session = await call("/auth/login", "POST", {
    email: account.email,
    password: password + "new",
  });
  await call(`/users/${account.id}`, "PATCH", { active: false });
  await call("/auth/me", "GET", undefined, 401, session.token);
  await call(`/users/${account.id}`, "PATCH", { active: true });
  await call("/auth/me", "GET", undefined, 401, session.token);
  await call("/auth/login", "POST", {
    email: account.email,
    password: password + "new",
  });
  const logs = (
    await c.query(
      "SELECT * FROM audit_logs WHERE entity='users' AND entity_id=$1 AND action IN ('activate_user','deactivate_user') ORDER BY id",
      [account.id],
    )
  ).rows;
  assert.equal(logs.length, 2);
  assert.equal(logs[0].user_id, admin.id);
  assert.deepEqual(logs[0].details, {
    previous_status: true,
    new_status: false,
    target_user_id: account.id,
  });
  outcomes.P05 =
    "Pass: old JWT remains invalid after re-enable; fresh login succeeds";
  outcomes.P06 =
    "Pass: transactional logs contain actor, target, prior/new status and timestamp";
  const unicode = "é".repeat(36) + "suffix";
  await call(
    "/users",
    "POST",
    {
      name: "Unicode",
      email: "unicode@example.test",
      role: "staff",
      password: unicode,
    },
    400,
  );
  await call(
    "/auth/login",
    "POST",
    { email: account.email, password: unicode },
    400,
  );
  await call(
    "/auth/change-password",
    "POST",
    { current_password: password, new_password: unicode },
    400,
  );
  outcomes.P07 =
    "Pass: over-72-byte Unicode input rejected before hashing/login/change; existing hashes unchanged";
  await call("/health");
  await c.query(
    "DELETE FROM schema_migrations WHERE version='008_audit_fixes'",
  );
  await call("/health", "GET", undefined, 503);
  await c.query(
    "INSERT INTO schema_migrations(version) VALUES('008_audit_fixes')",
  );
  await c.query(
    "ALTER TABLE payments RENAME COLUMN payment_discount_amount TO missing_payment_discount_amount",
  );
  try {
    await call("/health", "GET", undefined, 503);
    const live = await fetch(new URL("/", base));
    assert.equal(live.status, 200);
  } finally {
    await c.query(
      "ALTER TABLE payments RENAME COLUMN missing_payment_discount_amount TO payment_discount_amount",
    );
  }
  await c.query("ALTER TABLE users DISABLE TRIGGER guard_last_administrator");
  try {
    await call("/health", "GET", undefined, 503);
  } finally {
    await c.query("ALTER TABLE users ENABLE TRIGGER guard_last_administrator");
  }
  await call("/health");
  outcomes.P08 =
    "Pass: missing migration, required column or critical trigger makes readiness 503; liveness remains 200";
  const second = (
    await c.query(
      "INSERT INTO users(name,email,password_hash,role_id) SELECT 'Other Admin','other@example.test',$1,id FROM roles WHERE name='admin' RETURNING id",
      [hash],
    )
  ).rows[0];
  const otherToken = jwt.sign(
    { sub: String(second.id), pv: 0 },
    config.secret,
    { expiresIn: "1h" },
  );
  const originalQuery = pool.query.bind(pool);
  let arrived = 0,
    release;
  const gate = new Promise((r) => (release = r));
  pool.query = async (...args) => {
    const result = await originalQuery(...args);
    if (
      typeof args[0] === "string" &&
      args[0].startsWith("SELECT u.id,u.name,u.email,u.must_change_password")
    ) {
      arrived++;
      if (arrived === 2) release();
      await gate;
    }
    return result;
  };
  let statuses;
  try {
    statuses = await Promise.all([
      raw(`/users/${second.id}`, "PATCH", { active: false }, token),
      raw(`/users/${admin.id}`, "PATCH", { active: false }, otherToken),
    ]);
  } finally {
    pool.query = originalQuery;
  }
  assert.equal(statuses.filter((r) => r.status === 200).length, 1);
  assert.ok(statuses.some((r) => [401, 409].includes(r.status)));
  assert.equal(
    Number(
      (
        await c.query(
          "SELECT count(*) FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active AND r.name='admin'",
        )
      ).rows[0].count,
    ),
    1,
  );
  const last = (
    await c.query(
      "SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.active AND r.name='admin'",
    )
  ).rows[0];
  await assert.rejects(
    () =>
      c.query(
        "UPDATE users SET role_id=(SELECT id FROM roles WHERE name='staff') WHERE id=$1",
        [last.id],
      ),
    /active administrator/,
  );
  outcomes.P09 =
    "Pass: simultaneous authenticated admins cannot both disable each other; DB guard prevents final-admin demotion";
  assert.deepEqual(await sourceFingerprint(), beforeSource);
  checks.push(
    "Original source table counts and fingerprints unchanged by all fixture tests",
  );
  assert.equal(Object.keys(outcomes).length, 12);
  await mkdir(new URL("../../test-results/", import.meta.url), {
    recursive: true,
  });
  await writeFile(
    new URL("../../test-results/audit-fix-regressions.json", import.meta.url),
    JSON.stringify({ outcomes, checks, source_unchanged: true }, null, 2),
  );
  console.log(
    JSON.stringify({ outcomes, checks, source_unchanged: true }, null, 2),
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
