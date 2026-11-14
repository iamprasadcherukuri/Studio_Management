import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import jwt from "jsonwebtoken";
import { migrate } from "../database/migrate.js";
import { masterCode } from "../../shared/master-code.mjs";
const schema = "studio_test_" + randomBytes(6).toString("hex");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
let pool, server;
try {
  await c.query(
    (
      await readFile(new URL("../database/schema.sql", import.meta.url), "utf8")
    ).replace(/\bstudio\b/g, schema),
  );
  await c.query(`SET search_path TO ${schema},public`);
  const admin = (
    await c.query(
      `INSERT INTO users(name,email,password_hash,role_id) SELECT 'Master Admin','master@example.test','unused',id FROM roles WHERE name='admin' RETURNING id`,
    )
  ).rows[0];
  const staff = (
    await c.query(
      `INSERT INTO users(name,email,password_hash,role_id) SELECT 'Master Staff','staff@example.test','unused',id FROM roles WHERE name='staff' RETURNING id`,
    )
  ).rows[0];
  const customer = (
    await c.query(
      "INSERT INTO customers(name,mobile) VALUES('Existing customer','9876543210') RETURNING id",
    )
  ).rows[0];
  const booking = (
    await c.query(
      "INSERT INTO bookings(customer_id,event_type_id,event_date,location,agreed_amount) SELECT $1,id,CURRENT_DATE,'Existing venue',100 FROM event_types WHERE name='Wedding' RETURNING *",
      [customer.id],
    )
  ).rows[0];
  const album = (
    await c.query(
      "INSERT INTO albums(booking_id,album_type,size,pages) VALUES($1,'Custom Heritage Album','Custom Large',10) RETURNING *",
      [booking.id],
    )
  ).rows[0];
  await migrate(c, schema);
  await migrate(c, schema);
  assert.deepEqual(
    (await c.query("SELECT * FROM albums WHERE id=$1", [album.id])).rows[0],
    album,
  );
  assert.equal(
    (await c.query("SELECT count(*)::int n FROM master_entity")).rows[0].n,
    9,
  );
  assert.equal(
    (
      await c.query(
        "SELECT count(*)::int n FROM master_entity_value v JOIN master_entity e USING(entity_id) WHERE e.entity_code='ALBUM_TYPE'",
      )
    ).rows[0].n,
    22,
  );
  assert.equal(
    (await c.query("SELECT count(*)::int n FROM schema_migrations")).rows[0].n,
    8,
  );
  process.env.NODE_ENV = "test";
  process.env.DB_SCHEMA = schema;
  const { app } = await import("../server.js");
  ({ pool } = await import("../database/pool.js"));
  const { config } = await import("../config/env.js");
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.on("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const token = jwt.sign({ sub: admin.id, pv: 0 }, config.secret),
    staffToken = jwt.sign({ sub: staff.id, pv: 0 }, config.secret);
  async function call(
    path,
    method = "GET",
    body,
    expected = 200,
    auth = token,
  ) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: "Bearer " + auth } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    assert.equal(
      r.status,
      expected,
      `${method} ${path}: ${JSON.stringify(data)}`,
    );
    return data;
  }
  const name = (name, extra = {}) => ({
    name,
    description: "",
    display_order: 0,
    is_active: true,
    ...extra,
  });
  assert.equal(masterCode("  Pre--Wedding Album "), "PRE_WEDDING_ALBUM");
  assert.equal(masterCode("8×12"), "8_12");
  assert.throws(() => masterCode("!"));
  assert.throws(() => masterCode("a".repeat(101)));
  for (const input of [
    "Album Type",
    "Pre-Wedding Album",
    "  Bank -- Transfer ",
    "8×12",
    "a/b+c",
  ])
    assert.equal(
      (await c.query("SELECT master_code($1) AS code", [input])).rows[0].code,
      masterCode(input),
    );
  const upgrade = (
    await readFile(
      new URL("../database/upgrade_004_master_management.sql", import.meta.url),
      "utf8",
    )
  ).replace(/\bstudio\b/g, schema);
  await assert.rejects(
    () => c.query(upgrade),
    /Master migration already applied/,
  );
  await c.query("ROLLBACK");
  await call("/master/entities", "GET", undefined, 401, "");
  await call("/master/entities", "POST", name("Forbidden"), 403, staffToken);
  const entities = (await call("/master/entities?limit=100")).data;
  const entity = await call(
    "/master/entities",
    "POST",
    name("Delivery Options"),
    201,
  );
  assert.equal(entity.entity_code, "DELIVERY_OPTIONS");
  await call("/master/entities", "POST", name("Delivery-Options"), 409);
  const duplicateStatuses = await Promise.all(
    [1, 2].map(() =>
      fetch(base + "/master/entities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(name("Concurrent Entity")),
      }).then((r) => r.status),
    ),
  );
  assert.deepEqual(duplicateStatuses.sort(), [201, 409]);
  await call("/master/entities", "POST", name("!!!"), 400);
  await call("/master/entities", "POST", {}, 400);
  await call(
    `/master/entities/${entity.entity_id}`,
    "PUT",
    name("Delivery Choices"),
  );
  assert.equal(
    (await call(`/master/entities/${entity.entity_id}`)).entity_code,
    "DELIVERY_OPTIONS",
  );
  const v = await call(
    `/master/entities/${entity.entity_id}/values`,
    "POST",
    name("Home Delivery", { display_order: 5 }),
    201,
  );
  assert.equal(v.value_code, "HOME_DELIVERY");
  await call(
    `/master/entities/${entity.entity_id}/values`,
    "POST",
    name("Home--Delivery"),
    409,
  );
  const parallel = await Promise.all([
    call(
      `/master/entities/${entity.entity_id}/values`,
      "POST",
      name("Express Delivery"),
      201,
    ),
    call("/master/entities", "POST", name("Print Options"), 201),
  ]);
  await call(
    `/master/entities/${parallel[1].entity_id}/values`,
    "POST",
    name("Home Delivery"),
    201,
  );
  await call(
    `/master/values/${v.entity_value_id}`,
    "PUT",
    name("Delivery to home", { display_order: 5 }),
  );
  const edited = (
    await call(
      `/master/entities/${entity.entity_id}/values?search=Delivery%20to`,
    )
  ).data[0];
  assert.equal(edited.value_code, "HOME_DELIVERY");
  assert.equal(edited.stored_value, "Home Delivery");
  await call(`/master/values/${v.entity_value_id}/status`, "PATCH", {
    is_active: false,
  });
  assert.equal(
    (
      await call(
        "/master/values?entityCode=DELIVERY_OPTIONS",
        "GET",
        undefined,
        200,
        staffToken,
      )
    ).data.some((x) => x.entity_value_id === v.entity_value_id),
    false,
  );
  assert.equal(
    (await call(`/master/entities/${entity.entity_id}/values?status=inactive`))
      .total,
    1,
  );
  await call(
    `/master/values/${v.entity_value_id}/status`,
    "PATCH",
    { is_active: true },
    403,
    staffToken,
  );
  await call(`/master/entities/${entity.entity_id}/status`, "PATCH", {
    is_active: false,
  });
  assert.equal(
    (
      await call(
        "/master/values?entityCode=DELIVERY_OPTIONS",
        "GET",
        undefined,
        200,
        staffToken,
      )
    ).total,
    0,
  );
  await call(
    `/master/entities/${entity.entity_id}/values`,
    "POST",
    name("Blocked"),
    400,
  );
  await assert.rejects(
    () =>
      c.query(
        "UPDATE master_entity SET entity_code='CHANGED' WHERE entity_id=$1",
        [entity.entity_id],
      ),
    /cannot be changed/,
  );
  await assert.rejects(
    () =>
      c.query(
        "UPDATE master_entity_value SET value_code='CHANGED' WHERE entity_value_id=$1",
        [v.entity_value_id],
      ),
    /cannot be changed/,
  );
  const albumEntity = entities.find((e) => e.entity_code === "ALBUM_TYPE");
  const custom = await call(
    `/master/entities/${albumEntity.entity_id}/values`,
    "POST",
    name("Story Album"),
    201,
  );
  const size = (await call("/master/values?entityCode=ALBUM_SIZE")).data[0];
  const albumBody = {
    booking_id: booking.id,
    album_type: custom.stored_value,
    size: size.stored_value,
    pages: 20,
    printing_cost: 0,
    expected_delivery: null,
    actual_delivery: null,
    status: "Pending",
    acknowledgement: null,
    notes: null,
  };
  const saved = await call("/albums", "POST", albumBody, 201);
  await call(`/master/values/${custom.entity_value_id}/status`, "PATCH", {
    is_active: false,
  });
  await call("/albums", "POST", albumBody, 400);
  await call(`/albums/${saved.id}`, "PUT", { ...albumBody, pages: 21 });
  await call("/albums", "POST", { ...albumBody, album_type: "Invented" }, 400);
  const paymentEntity = entities.find((e) => e.entity_code === "PAYMENT_TYPE");
  const method = await call(
    `/master/entities/${paymentEntity.entity_id}/values`,
    "POST",
    name("Demand Draft"),
    201,
  );
  const paymentBody = {
    booking_id: booking.id,
    date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    amount: 10,
    method: method.stored_value,
    payment_type: "Partial",
    idempotency_key: randomUUID(),
  };
  const payment = await call("/payments", "POST", paymentBody, 201);
  assert.equal(
    (await call("/payments", "POST", paymentBody, 201)).id,
    payment.id,
  );
  await call(
    "/payments",
    "POST",
    { ...paymentBody, method: "Unknown", idempotency_key: randomUUID() },
    400,
  );
  const pdf = await fetch(base + `/payments/${payment.id}/receipt/pdf`, {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(pdf.status, 200);
  assert.match(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    /^%PDF/,
  );
  const events = (await call("/lookups")).event_types;
  assert.ok(events.some((e) => e.name === "Reception"));
  const event = await call(
    `/master/entities/${entities.find((e) => e.entity_code === "EVENT_TYPE").entity_id}/values`,
    "POST",
    name("Housewarming"),
    201,
  );
  assert.ok(
    (await call("/lookups")).event_types.some(
      (e) => e.id === event.legacy_event_type_id,
    ),
  );
  const sorted = await call(
    `/master/entities/${albumEntity.entity_id}/values?limit=2&page=2`,
  );
  assert.equal(sorted.data.length, 2);
  assert.equal(sorted.page, 2);
  assert.ok(
    (
      await c.query(
        "SELECT count(*)::int n FROM audit_logs WHERE entity='master_entity_value'",
      )
    ).rows[0].n > 0,
  );
  await assert.rejects(
    () => migrate(c, schema, true),
    /Rollback refused|Automatic master rollback/,
  );
  console.log(
    "PASS: master seeds/imports, existing album preservation, reruns, shared code generation, duplicate/concurrent constraints, immutable codes, name edits, statuses, searches, sorting/pagination, admin/staff permissions, custom album/payment choices, inactive historical edits, event bridge, PDF and audit records.",
  );
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  if (pool) await pool.end();
  await c.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await c.end();
}
