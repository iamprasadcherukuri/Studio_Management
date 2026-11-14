import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { pool, transaction } from "../database/pool.js";
import { config } from "../config/env.js";
import { auth, admin } from "../middleware/auth.js";
import { parse, passwordInput } from "../services/validation.js";
import { setUserStatus } from "../services/user-status.js";
import { databaseReady } from "../services/readiness.js";
import { definitions, writeRecord, fail } from "../services/records.js";
import { studioSettings, saveStudioSettings } from "../services/branding.js";
import { masterOptions } from "../services/master-values.js";
import {
  reversePayment,
  reversalHistory,
} from "../services/payment-reversals.js";
export const api = Router();
api.use("/auth", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
const limited = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
api.get("/health", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    if (!(await databaseReady())) throw new Error("Schema not ready");
    res.json({ status: "OK", service: "Studio Management API" });
  } catch {
    res.status(503).json({
      status: "ERROR",
      service: "Studio Management API",
      error: "Database unavailable",
    });
  }
});
api.get("/auth/status", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT EXISTS(SELECT 1 FROM users) AS initialized",
  );
  res.json(rows[0]);
});
api.post("/auth/setup", limited, async (req, res) => {
  const supplied = Buffer.from(String(req.body.setup_token || ""));
  const expected = Buffer.from(process.env.SETUP_TOKEN || "");
  if (
    expected.length < 24 ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    throw fail("Invalid setup token", 403);
  const data = parse("users", { ...req.body, role: "admin" });
  const hash = await bcrypt.hash(data.password, 12);
  await transaction(async (c) => {
    await c.query("LOCK TABLE users IN EXCLUSIVE MODE");
    if ((await c.query("SELECT id FROM users LIMIT 1")).rowCount)
      throw fail("Setup already completed", 409);
    await c.query(
      "INSERT INTO users(name,email,password_hash,role_id) SELECT $1,$2,$3,id FROM roles WHERE name='admin'",
      [data.name, data.email, hash],
    );
  });
  res.status(201).json({ message: "Administrator created. Please sign in." });
});
api.post("/auth/login", limited, async (req, res) => {
  if (Buffer.byteLength(String(req.body.password || ""), "utf8") > 72)
    throw fail("Password must be at most 72 UTF-8 bytes");
  const { rows } = await pool.query(
    "SELECT u.*,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE lower(email)=$1 AND active=true",
    [
      String(req.body.email || "")
        .toLowerCase()
        .trim(),
    ],
  );
  const user = rows[0];
  const valid = await bcrypt.compare(
    String(req.body.password || ""),
    user?.password_hash ||
      "$2b$12$XjcWQ4Vo4pBmNo1sGNTYgO.3w4A1BV1nOtP7E0iF3pT4BJgW4VP9q",
  );
  if (!user || !valid) throw fail("Incorrect email or password", 401);
  res.json({
    token: jwt.sign(
      { sub: String(user.id), pv: user.password_version },
      config.secret,
      {
        expiresIn: "8h",
      },
    ),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      must_change_password: user.must_change_password,
    },
  });
});
api.use(auth);
api.get("/bookings/:id", async (req, res) => {
  if (
    !/^[1-9][0-9]{0,9}$/.test(req.params.id) ||
    Number(req.params.id) > 2147483647
  )
    throw fail("Invalid booking ID");
  const def = definitions.bookings;
  const { rows } = await pool.query(
    `SELECT ${def.select},c.mobile AS customer_mobile,c.email AS customer_email,EXISTS(SELECT 1 FROM invoices i WHERE i.booking_id=t.id AND i.status='Issued') AS has_active_invoice,ARRAY(SELECT s.name FROM booking_staff bs JOIN staff s ON s.id=bs.staff_id WHERE bs.booking_id=t.id ORDER BY s.name,s.id) AS staff_names FROM bookings t ${def.join} WHERE t.id=$1`,
    [req.params.id],
  );
  if (!rows[0]) throw fail("Booking not found", 404);
  res.set("Cache-Control", "no-store").json(rows[0]);
});
api.get("/customers/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (
    q.length > 150 ||
    (req.query.q != null && typeof req.query.q !== "string")
  )
    throw fail("Search must be at most 150 characters");
  const selected = req.query.id;
  if (selected != null && !/^[1-9][0-9]{0,9}$/.test(String(selected)))
    throw fail("Invalid customer ID");
  if (selected != null && Number(selected) > 2147483647)
    throw fail("Invalid customer ID");
  const { rows } = await pool.query(
    `SELECT id AS customer_id,name AS customer_name,mobile AS mobile_number FROM customers WHERE ${selected != null ? "id=$1" : "(strpos(lower(name),lower($1))>0 OR strpos(mobile,$1)>0)"} ORDER BY lower(name),id LIMIT 10`,
    [selected ?? q],
  );
  res.set("Cache-Control", "no-store").json({ data: rows });
});
api.get("/auth/me", (req, res) => res.json(req.user));
api.get("/payments/:id/reversals", admin, async (req, res) =>
  res.json({ data: await reversalHistory(req.params.id) }),
);
api.post("/payments/:id/reversals", admin, async (req, res) =>
  res.status(201).json(await reversePayment(req.params.id, req.body, req.user)),
);
api.post("/auth/change-password", limited, async (req, res) => {
  const data = parse("changePassword", req.body);
  await transaction(async (c) => {
    const { rows } = await c.query(
      "SELECT password_hash,password_version FROM users WHERE id=$1 AND active=true FOR UPDATE",
      [req.user.id],
    );
    const current = rows[0];
    if (!current || current.password_version !== req.user.password_version)
      throw fail("Session expired; please sign in again", 401);
    if (!(await bcrypt.compare(data.current_password, current.password_hash)))
      throw fail("Current password is incorrect", 400);
    if (await bcrypt.compare(data.new_password, current.password_hash))
      throw fail("Choose a different password from your temporary password");
    const hash = await bcrypt.hash(data.new_password, 12);
    await c.query(
      "UPDATE users SET password_hash=$1,must_change_password=false,password_version=password_version+1 WHERE id=$2",
      [hash, req.user.id],
    );
    await c.query(
      "INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES($1,'change_password','users',$1)",
      [req.user.id],
    );
  });
  res.json({ message: "Password changed. Sign in with your new password." });
});
api.get("/lookups", async (req, res) => {
  const result = {};
  for (const [key, sql] of Object.entries({
    customers: "SELECT id,name FROM customers ORDER BY name",
    bookings:
      "SELECT b.id,c.name || ' · ' || e.name || ' · #' || b.id AS name FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN event_types e ON e.id=b.event_type_id ORDER BY b.id DESC",
    event_types:
      "SELECT v.legacy_event_type_id AS id,v.value_name AS name FROM master_entity_value v JOIN master_entity e USING(entity_id) WHERE e.entity_code='EVENT_TYPE' AND e.is_active AND v.is_active ORDER BY v.display_order,v.entity_value_id",
    packages: "SELECT * FROM packages ORDER BY name",
    staff:
      "SELECT id,user_id,name,mobile,active FROM staff WHERE active=true ORDER BY name",
  }))
    result[key] = (await pool.query(sql)).rows;
  result.master_values = await masterOptions();
  res.json(result);
});
api.get("/dashboard", async (req, res) => {
  const metrics = (
    await pool.query(
      `SELECT (SELECT count(*) FROM customers) AS customers,(SELECT count(*) FROM bookings) AS bookings,(SELECT COALESCE(sum(amount),0) FROM payment_ledger) AS received,(SELECT COALESCE(sum(agreed_amount),0) FROM bookings WHERE status<>'cancelled')-(SELECT COALESCE(sum(amount),0) FROM payment_ledger) AS pending,(SELECT COALESCE(sum(amount),0) FROM expenses) AS expenses,(SELECT COALESCE(sum(amount),0) FROM payment_ledger)-(SELECT COALESCE(sum(amount),0) FROM expenses) AS cash_balance,(SELECT count(*) FROM albums WHERE status<>'Delivered') AS pending_albums`,
    )
  ).rows[0];
  const months = (
    await pool.query(
      `SELECT to_char(m,'Mon') AS month,COALESCE((SELECT sum(amount) FROM payment_ledger WHERE date>=m AND date<m+interval '1 month'),0) AS revenue,COALESCE((SELECT sum(amount) FROM expenses WHERE date>=m AND date<m+interval '1 month'),0) AS expenses FROM generate_series(date_trunc('month',CURRENT_DATE)-interval '5 months',date_trunc('month',CURRENT_DATE),interval '1 month') m`,
    )
  ).rows;
  const bookings = (
    await pool.query(
      "SELECT b.id,c.name AS customer_name,e.name AS event_type,b.event_date,b.location,b.status FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN event_types e ON e.id=b.event_type_id WHERE event_date>=CURRENT_DATE AND status IN ('confirmed','in progress') ORDER BY event_date LIMIT 6",
    )
  ).rows;
  const recent = (
    await pool.query(
      "SELECT b.id,c.name AS customer_name,b.event_date,b.agreed_amount,b.status FROM bookings b JOIN customers c ON c.id=b.customer_id ORDER BY b.id DESC LIMIT 5",
    )
  ).rows;
  const albums = (
    await pool.query(
      "SELECT status,count(*)::int AS count FROM albums GROUP BY status",
    )
  ).rows;
  res.json({ metrics, months, bookings, recent, albums });
});
api.get("/customers/:id/history", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${definitions.bookings.select} FROM bookings t ${definitions.bookings.join} WHERE t.customer_id=$1 ORDER BY t.event_date DESC`,
    [req.params.id],
  );
  res.json(rows);
});
api.get("/settings", async (req, res) => res.json(await studioSettings()));
api.put("/settings", admin, async (req, res) => {
  const v = parse("settings", req.body);
  await saveStudioSettings(v, req.user);
  res.json(await studioSettings());
});
api.get("/users", admin, async (req, res) =>
  res.json({
    data: (
      await pool.query(
        "SELECT u.id,u.name,u.email,u.active,r.name AS role FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.id",
      )
    ).rows,
  }),
);
api.post("/users", admin, async (req, res) => {
  const temporaryPassword =
    req.body.password || randomBytes(18).toString("base64url");
  const v = parse("users", { ...req.body, password: temporaryPassword });
  const hash = await bcrypt.hash(v.password, 12);
  res
    .set("Cache-Control", "no-store")
    .status(201)
    .json({
      ...(await transaction(async (c) => {
        const row = (
          await c.query(
            "INSERT INTO users(name,email,password_hash,role_id,must_change_password) SELECT $1,$2,$3,id,true FROM roles WHERE name=$4 RETURNING id,name,email,must_change_password",
            [v.name, v.email, hash, v.role],
          )
        ).rows[0];
        await c.query(
          "INSERT INTO audit_logs(user_id,action,entity,entity_id,details) VALUES($1,'create_user','users',$2,$3)",
          [req.user.id, row.id, { role: v.role }],
        );
        return row;
      })),
      temporary_password: temporaryPassword,
    });
});
api.patch("/users/:id", admin, async (req, res) => {
  res.json(
    await setUserStatus(Number(req.params.id), req.body.active, req.user),
  );
});
api.post("/users/:id/reset-password", admin, limited, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw fail("Invalid user ID");
  if (id === req.user.id)
    throw fail("Use your current password to change your own password instead");
  const input = parse("resetPassword", req.body);
  const temporaryPassword = randomBytes(18).toString("base64url");
  passwordInput.parse(temporaryPassword);
  const hash = await bcrypt.hash(temporaryPassword, 12);
  const user = await transaction(async (c) => {
    const rows = (
      await c.query(
        "SELECT id,name,email,password_hash,password_version,active FROM users WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE",
        [[req.user.id, id]],
      )
    ).rows;
    const actor = rows.find((row) => row.id === req.user.id),
      target = rows.find((row) => row.id === id);
    if (!actor?.active || actor.password_version !== req.user.password_version)
      throw fail("Session expired; please sign in again", 401);
    if (!(await bcrypt.compare(input.current_password, actor.password_hash)))
      throw fail("Your current password is incorrect");
    if (!target) throw fail("User not found", 404);
    if (!target.active)
      throw fail("Enable this account before resetting its password");
    await c.query(
      "UPDATE users SET password_hash=$1,must_change_password=true,password_version=password_version+1 WHERE id=$2",
      [hash, id],
    );
    await c.query(
      "INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES($1,'reset_password','users',$2)",
      [req.user.id, id],
    );
    return { id: target.id, name: target.name, email: target.email };
  });
  res.set("Cache-Control", "no-store").json({
    ...user,
    temporary_password: temporaryPassword,
    must_change_password: true,
    reset: true,
  });
});
api.get("/reports", admin, async (req, res) => {
  const from = String(req.query.from || "2000-01-01"),
    to = String(req.query.to || "2100-12-31");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    from > to
  )
    throw fail("Select a valid date range");
  const sql = {
    receipts:
      "SELECT p.id,p.payment_id,p.entry_type,p.date,c.name AS customer,p.booking_id,p.amount,p.method FROM payment_ledger p JOIN bookings b ON b.id=p.booking_id JOIN customers c ON c.id=b.customer_id WHERE p.date BETWEEN $1 AND $2 ORDER BY p.date DESC",
    bookings:
      "SELECT b.id,b.event_date,c.name AS customer,b.location,b.status,b.agreed_amount FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE event_date BETWEEN $1 AND $2 ORDER BY event_date",
    outstanding:
      "SELECT b.id,c.name AS customer,b.event_date,b.agreed_amount,COALESCE(sum(p.amount),0) AS received,b.agreed_amount-COALESCE(sum(p.amount),0) AS outstanding FROM bookings b JOIN customers c ON c.id=b.customer_id LEFT JOIN payment_ledger p ON p.booking_id=b.id WHERE b.status<>'cancelled' AND b.event_date BETWEEN $1 AND $2 GROUP BY b.id,c.name HAVING b.agreed_amount>COALESCE(sum(p.amount),0)",
    expenses:
      "SELECT id,date,category,description,amount,method FROM expenses WHERE date BETWEEN $1 AND $2 ORDER BY date DESC",
    albums:
      "SELECT a.id,c.name AS customer,a.status,a.expected_delivery,a.actual_delivery FROM albums a JOIN bookings b ON b.id=a.booking_id JOIN customers c ON c.id=b.customer_id WHERE COALESCE(a.actual_delivery,a.expected_delivery) BETWEEN $1 AND $2",
    customers:
      "SELECT c.customer_code,c.name,c.mobile,count(b.id)::int AS bookings,COALESCE(sum(b.agreed_amount),0) AS booked_amount FROM customers c LEFT JOIN bookings b ON b.customer_id=c.id AND b.event_date BETWEEN $1 AND $2 GROUP BY c.id ORDER BY c.name",
    summary:
      "SELECT 'Receipts' AS category,COALESCE(sum(amount),0) AS amount FROM payment_ledger WHERE date BETWEEN $1 AND $2 UNION ALL SELECT 'Expenses paid',COALESCE(sum(amount),0) FROM expenses WHERE date BETWEEN $1 AND $2 UNION ALL SELECT 'Net cash balance',(SELECT COALESCE(sum(amount),0) FROM payment_ledger WHERE date BETWEEN $1 AND $2)-(SELECT COALESCE(sum(amount),0) FROM expenses WHERE date BETWEEN $1 AND $2)",
    categories:
      "SELECT category,sum(amount) AS amount FROM expenses WHERE date BETWEEN $1 AND $2 GROUP BY category ORDER BY category",
    monthly:
      "SELECT to_char(date,'YYYY-MM') AS month,sum(amount) AS receipts FROM payment_ledger WHERE date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1",
    daily:
      "SELECT date,sum(amount) AS receipts FROM payment_ledger WHERE date BETWEEN $1 AND $2 GROUP BY date ORDER BY date",
    yearly:
      "SELECT to_char(date,'YYYY') AS year,sum(amount) AS receipts FROM payment_ledger WHERE date BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1",
  };
  const kind = String(req.query.type || "summary");
  if (!sql[kind]) throw fail("Unknown report");
  const { rows } = await pool.query(sql[kind], [from, to]);
  res.json({ data: rows });
});
for (const [kind, def] of Object.entries(definitions)) {
  const permission = (req, res, next) => {
    if (
      req.user.role === "staff" &&
      !["customers", "bookings", "albums"].includes(kind)
    )
      return res.status(403).json({ error: "Administrator access required" });
    next();
  };
  api.get("/" + kind, permission, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1),
      limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const params = [`%${String(req.query.search || "")}%`];
    let where = `WHERE (${def.search}) ILIKE $1`;
    if (req.query.status && ["bookings", "albums"].includes(kind)) {
      params.push(req.query.status);
      where += ` AND t.status=$${params.length}`;
    }
    if (req.query.category && kind === "expenses") {
      params.push(req.query.category);
      where += ` AND t.category=$${params.length}`;
    }
    const dateField =
      kind === "bookings"
        ? "event_date"
        : ["payments", "expenses"].includes(kind)
          ? "date"
          : kind === "albums"
            ? "expected_delivery"
            : null;
    for (const [key, op] of [
      ["from", ">="],
      ["to", "<="],
    ])
      if (dateField && req.query[key]) {
        params.push(req.query[key]);
        where += ` AND t.${dateField}${op}$${params.length}`;
      }
    const base = `FROM ${def.table} t ${def.join || ""} ${where}`;
    const count = await pool.query(`SELECT count(*) ${base}`, params);
    const { rows } = await pool.query(
      `SELECT ${def.select} ${base} ORDER BY t.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit],
    );
    res.json({ data: rows, total: Number(count.rows[0].count), page, limit });
  });
  api.post("/" + kind, permission, async (req, res) =>
    res
      .status(201)
      .json(await writeRecord(kind, parse(kind, req.body), req.user)),
  );
  if (kind !== "payments")
    api.put("/" + kind, permission, async (req, res) => {
      throw fail("Record ID required");
    });
  if (kind !== "payments")
    api.put("/" + kind + "/:id", permission, async (req, res) =>
      res.json(
        await writeRecord(kind, parse(kind, req.body), req.user, req.params.id),
      ),
    );
  if (["customers", "expenses", "packages", "staff"].includes(kind))
    api.delete("/" + kind + "/:id", admin, async (req, res) => {
      await transaction(async (c) => {
        const result = await c.query(
          `DELETE FROM ${def.table} WHERE id=$1 RETURNING id`,
          [req.params.id],
        );
        if (!result.rowCount) throw fail("Record not found", 404);
        await c.query(
          "INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES($1,$2,$3,$4)",
          [req.user.id, "delete", kind, Number(req.params.id)],
        );
      });
      res.json({ message: "Deleted" });
    });
}
