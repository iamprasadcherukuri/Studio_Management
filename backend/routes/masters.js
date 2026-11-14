import { Router } from "express";
import { z } from "zod";
import { pool, transaction } from "../database/pool.js";
import { auth, admin } from "../middleware/auth.js";
import { masterCode } from "../services/master-values.js";
export const masters = Router();
masters.use("/master", auth);
const id = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const body = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).default(""),
  display_order: z.number().int().min(0).max(2147483647).default(0),
  is_active: z.boolean().default(true),
});
const status = z.object({ is_active: z.boolean() });
const missing = () =>
  Object.assign(new Error("Master record not found"), { status: 404 });
async function audit(c, user, action, entity, record) {
  // Existing audit entity_id is INTEGER; retain large master IDs in action if necessary.
  await c.query(
    "INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES($1,$2,$3,$4)",
    [
      user.id,
      `${action}:${record}`,
      entity,
      Number(record) <= 2147483647 ? record : null,
    ],
  );
}
async function paged(req, res, values = false, entityId) {
  const q = z
    .object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      search: z.string().max(150).default(""),
      status: z.enum(["active", "inactive", "all"]).default("all"),
      sort: z.enum(["display_order", "name", "code"]).default("display_order"),
      direction: z.enum(["asc", "desc"]).default("asc"),
      entityCode: z.string().max(100).optional(),
    })
    .parse(req.query);
  const p = [],
    where = [];
  const add = (sql, v) => {
    p.push(v);
    where.push(sql.replace("?", `$${p.length}`));
  };
  const field = values ? "value" : "entity",
    alias = values ? "v" : "e";
  if (req.user.role !== "admin") {
    where.push("e.is_active");
    if (values) where.push("v.is_active");
  } else if (q.status !== "all")
    add(`${alias}.is_active=?`, q.status === "active");
  if (entityId) add("e.entity_id=?", id.parse(entityId));
  if (q.entityCode) add("e.entity_code=?", q.entityCode);
  if (q.search)
    add(
      `concat(${alias}.${field}_name,' ',${alias}.${field}_code) ILIKE ?`,
      "%" + q.search + "%",
    );
  const from = values
    ? "master_entity_value v JOIN master_entity e USING(entity_id)"
    : "master_entity e";
  const clause = where.length ? " WHERE " + where.join(" AND ") : "";
  const total = Number(
    (await pool.query(`SELECT count(*) FROM ${from}${clause}`, p)).rows[0]
      .count,
  );
  const order =
    q.sort === "display_order"
      ? `${alias}.display_order`
      : `${alias}.${field}_${q.sort}`;
  const rows = (
    await pool.query(
      `SELECT ${alias}.*${values ? ",e.entity_code" : ""} FROM ${from}${clause} ORDER BY ${order} ${q.direction},${alias}.${values ? "entity_value_id" : "entity_id"} LIMIT $${p.length + 1} OFFSET $${p.length + 2}`,
      [...p, q.limit, (q.page - 1) * q.limit],
    )
  ).rows;
  const summary =
    !values && req.user.role === "admin"
      ? (
          await pool.query(
            "SELECT (SELECT count(*) FROM master_entity)::int AS entities,count(*)::int AS values,count(*) FILTER(WHERE v.is_active AND e.is_active)::int AS active_values FROM master_entity_value v JOIN master_entity e USING(entity_id)",
          )
        ).rows[0]
      : undefined;
  res.json({
    data: rows,
    total,
    page: q.page,
    limit: q.limit,
    ...(summary ? { summary } : {}),
  });
}
masters.get("/master/entities", (req, res) => paged(req, res));
masters.get("/master/entities/:id", async (req, res) => {
  const row = (
    await pool.query(
      `SELECT * FROM master_entity WHERE entity_id=$1${req.user.role === "admin" ? "" : " AND is_active"}`,
      [id.parse(req.params.id)],
    )
  ).rows[0];
  if (!row) throw missing();
  res.json(row);
});
masters.get("/master/entities/:id/values", (req, res) =>
  paged(req, res, true, req.params.id),
);
masters.get("/master/values", (req, res) => paged(req, res, true));
async function save(req, res, values = false) {
  const d = body.parse({
      ...req.body,
      name: req.body?.name ?? req.body?.[values ? "value_name" : "entity_name"],
    }),
    recordId = req.params.id ? id.parse(req.params.id) : null;
  const field = values ? "value" : "entity",
    table = values ? "master_entity_value" : "master_entity",
    pk = values ? "entity_value_id" : "entity_id";
  try {
    const row = await transaction(async (c) => {
      let parent;
      if (values && !recordId) {
        parent = (
          await c.query(
            "SELECT * FROM master_entity WHERE entity_id=$1 FOR UPDATE",
            [id.parse(req.params.entityId)],
          )
        ).rows[0];
        if (!parent) throw missing();
        if (!parent.is_active)
          throw Object.assign(
            new Error("Activate the entity before adding values"),
            { status: 400 },
          );
      }
      let row;
      if (recordId) {
        const old = (
          await c.query(`SELECT * FROM ${table} WHERE ${pk}=$1 FOR UPDATE`, [
            recordId,
          ])
        ).rows[0];
        if (!old) throw missing();
        row = (
          await c.query(
            `UPDATE ${table} SET ${field}_name=$1,description=$2,display_order=$3,is_active=$4 WHERE ${pk}=$5 RETURNING *`,
            [d.name, d.description, d.display_order, d.is_active, recordId],
          )
        ).rows[0];
      } else {
        const code = masterCode(d.name);
        let eventId = null;
        if (values && parent.entity_code === "EVENT_TYPE")
          eventId = (
            await c.query(
              "INSERT INTO event_types(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id",
              [d.name],
            )
          ).rows[0].id;
        row = values
          ? (
              await c.query(
                "INSERT INTO master_entity_value(entity_id,value_code,value_name,description,display_order,is_active,stored_value,legacy_event_type_id) VALUES($1,$2,$3::text,$4,$5,$6,$3::text,$7) RETURNING *",
                [
                  parent.entity_id,
                  code,
                  d.name,
                  d.description,
                  d.display_order,
                  d.is_active,
                  eventId,
                ],
              )
            ).rows[0]
          : (
              await c.query(
                "INSERT INTO master_entity(entity_code,entity_name,description,display_order,is_active) VALUES($1,$2,$3,$4,$5) RETURNING *",
                [code, d.name, d.description, d.display_order, d.is_active],
              )
            ).rows[0];
      }
      await audit(c, req.user, recordId ? "update" : "create", table, row[pk]);
      return row;
    });
    res.status(recordId ? 200 : 201).json(row);
  } catch (e) {
    if (e.code === "23505")
      throw Object.assign(
        new Error(
          `Generated ${field} code already exists. Choose a different name; codes are not changed on edit.`,
        ),
        { status: 409 },
      );
    throw e;
  }
}
masters.post("/master/entities", admin, (req, res) => save(req, res));
masters.put("/master/entities/:id", admin, (req, res) => save(req, res));
masters.post("/master/entities/:entityId/values", admin, (req, res) =>
  save(req, res, true),
);
masters.put("/master/values/:id", admin, (req, res) => save(req, res, true));
for (const [path, table, pk] of [
  ["entities", "master_entity", "entity_id"],
  ["values", "master_entity_value", "entity_value_id"],
])
  masters.patch(`/master/${path}/:id/status`, admin, async (req, res) => {
    const d = status.parse(req.body),
      recordId = id.parse(req.params.id);
    const row = await transaction(async (c) => {
      const row = (
        await c.query(
          `UPDATE ${table} SET is_active=$1 WHERE ${pk}=$2 RETURNING *`,
          [d.is_active, recordId],
        )
      ).rows[0];
      if (!row) throw missing();
      await audit(
        c,
        req.user,
        d.is_active ? "activate" : "deactivate",
        table,
        recordId,
      );
      return row;
    });
    res.json(row);
  });
