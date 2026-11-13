import { Router } from "express";
import { pool } from "../database/pool.js";
import { auth, admin } from "../middleware/auth.js";
import { featureInput } from "../services/enhancement-validation.js";
import { fail } from "../services/records.js";
import {
  invoiceSelect,
  invoiceDetails,
  createInvoice,
  voidInvoice,
  receiptDetails,
} from "../services/invoices.js";
import {
  equipmentSelect,
  equipmentDetails,
  saveEquipment,
  retireEquipment,
  assignEquipment,
  returnEquipment,
  createMaintenance,
  updateMaintenance,
  postMaintenanceExpense,
} from "../services/equipment.js";
import { renderPdf } from "../services/pdf.js";
export const enhancements = Router();
for (const path of [
  "/invoices",
  "/equipment",
  "/equipment-assignments",
  "/equipment-maintenance",
  "/feature-summary",
])
  enhancements.use(path, auth, admin);
enhancements.use("/payments/:id/receipt/pdf", auth, admin);
const paging = (req) => ({
  page: Math.max(1, parseInt(req.query.page) || 1),
  limit: Math.min(100, Math.max(1, parseInt(req.query.limit) || 20)),
});
async function list(req, res, select, where, params) {
  const { page, limit } = paging(req);
  const count = (
    await pool.query(`SELECT count(*) FROM (${select} ${where}) result`, params)
  ).rows[0].count;
  const { rows } = await pool.query(
    `${select} ${where} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  res.json({ data: rows, total: Number(count), page, limit });
}
async function pdf(res, kind, data, preview) {
  const buffer = await renderPdf(kind, data);
  const name = kind === "invoice" ? data.invoice_number : data.receipt_number;
  res
    .set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `${preview ? "inline" : "attachment"}; filename="${name}.pdf"`,
      "Cache-Control": "private, no-store",
    })
    .send(buffer);
}
enhancements.get("/invoices", async (req, res) => {
  const params = [`%${String(req.query.search || "")}%`];
  let where =
    "WHERE (i.invoice_number || ' ' || i.booking_id::text || ' ' || (i.customer_snapshot->>'name')) ILIKE $1";
  if (req.query.status) {
    params.push(req.query.status);
    where += " AND i.status=$2";
  }
  await list(req, res, invoiceSelect, where, params);
});
enhancements.post("/invoices", async (req, res) =>
  res
    .status(201)
    .json(await createInvoice(featureInput("invoice", req.body), req.user)),
);
enhancements.get("/invoices/booking/:id", async (req, res) => {
  const row = (
    await pool.query(
      "SELECT b.id,b.agreed_amount,b.event_date,b.status,e.name AS event_type FROM bookings b JOIN event_types e ON e.id=b.event_type_id WHERE b.id=$1",
      [req.params.id],
    )
  ).rows[0];
  if (!row) throw fail("Booking not found", 404);
  res.json(row);
});
enhancements.get("/invoices/:id", async (req, res) =>
  res.json(await invoiceDetails(req.params.id)),
);
enhancements.post("/invoices/:id/void", async (req, res) =>
  res.json(
    await voidInvoice(
      req.params.id,
      featureInput("void", req.body).reason,
      req.user,
    ),
  ),
);
enhancements.get("/invoices/:id/pdf", async (req, res) =>
  pdf(
    res,
    "invoice",
    await invoiceDetails(req.params.id),
    req.query.preview === "1",
  ),
);
enhancements.get("/payments/:id/receipt/pdf", async (req, res) =>
  pdf(
    res,
    "receipt",
    await receiptDetails(req.params.id),
    req.query.preview === "1",
  ),
);
enhancements.get("/equipment", async (req, res) => {
  const params = [`%${String(req.query.search || "")}%`];
  let where =
    "WHERE (e.asset_code || ' ' || e.name || ' ' || coalesce(e.serial_number,'')) ILIKE $1";
  for (const key of ["category", "status"])
    if (req.query[key]) {
      params.push(req.query[key]);
      where +=
        key === "category"
          ? ` AND e.category=$${params.length}`
          : ` AND (CASE WHEN e.status='Available' AND EXISTS(SELECT 1 FROM equipment_assignments a WHERE a.equipment_id=e.id AND a.status='Active' AND a.assigned_date<=CURRENT_DATE) THEN 'Assigned' ELSE e.status END)=$${params.length}`;
    }
  await list(req, res, equipmentSelect, where, params);
});
enhancements.post("/equipment", async (req, res) =>
  res
    .status(201)
    .json(await saveEquipment(featureInput("equipment", req.body), req.user)),
);
enhancements.get("/equipment/options", async (req, res) =>
  res.json({
    data: (
      await pool.query(
        "SELECT id,name,asset_code,status FROM equipment WHERE status<>'Retired' ORDER BY asset_code",
      )
    ).rows,
  }),
);
enhancements.get("/equipment/expense-options", async (req, res) =>
  res.json({
    data: (
      await pool.query(
        "SELECT id,description,amount FROM expenses WHERE category='Equipment' AND NOT EXISTS(SELECT 1 FROM equipment_maintenance WHERE expense_id=expenses.id) ORDER BY id DESC",
      )
    ).rows,
  }),
);
enhancements.get("/equipment/:id", async (req, res) =>
  res.json(await equipmentDetails(req.params.id)),
);
enhancements.put("/equipment/:id", async (req, res) =>
  res.json(
    await saveEquipment(
      featureInput("equipment", req.body),
      req.user,
      req.params.id,
    ),
  ),
);
enhancements.patch("/equipment/:id/retire", async (req, res) =>
  res.json(await retireEquipment(req.params.id, req.user)),
);
enhancements.get("/equipment-assignments", async (req, res) => {
  const params = [];
  let where = "";
  if (req.query.equipment_id) {
    params.push(req.query.equipment_id);
    where = "WHERE a.equipment_id=$1";
  }
  await list(
    req,
    res,
    "SELECT a.*,e.name AS equipment_name,e.asset_code,c.name AS customer_name FROM equipment_assignments a JOIN equipment e ON e.id=a.equipment_id JOIN bookings b ON b.id=a.booking_id JOIN customers c ON c.id=b.customer_id",
    where,
    params,
  );
});
enhancements.post("/equipment-assignments", async (req, res) =>
  res
    .status(201)
    .json(
      await assignEquipment(featureInput("assignment", req.body), req.user),
    ),
);
enhancements.patch("/equipment-assignments/:id/return", async (req, res) =>
  res.json(
    await returnEquipment(
      req.params.id,
      featureInput("return", req.body).actual_return_date,
      req.user,
    ),
  ),
);
enhancements.get("/equipment-maintenance", async (req, res) => {
  const params = [];
  let where = "";
  if (req.query.equipment_id) {
    params.push(req.query.equipment_id);
    where = "WHERE m.equipment_id=$1";
  }
  await list(
    req,
    res,
    "SELECT m.*,e.name AS equipment_name,e.asset_code FROM equipment_maintenance m JOIN equipment e ON e.id=m.equipment_id",
    where,
    params,
  );
});
enhancements.post("/equipment-maintenance", async (req, res) =>
  res
    .status(201)
    .json(
      await createMaintenance(featureInput("maintenance", req.body), req.user),
    ),
);
enhancements.patch("/equipment-maintenance/:id", async (req, res) =>
  res.json(
    await updateMaintenance(
      req.params.id,
      featureInput("maintenanceUpdate", req.body),
      req.user,
    ),
  ),
);
enhancements.post("/equipment-maintenance/:id/expense", async (req, res) =>
  res
    .status(201)
    .json(
      await postMaintenanceExpense(
        req.params.id,
        featureInput("expense", req.body),
        req.user,
      ),
    ),
);
enhancements.get("/feature-summary", async (req, res) =>
  res.json(
    (
      await pool.query(`SELECT
 (SELECT coalesce(sum(total_amount),0)::numeric(12,2) FROM invoices WHERE status='Issued') AS total_invoiced,
 (SELECT coalesce(sum(greatest(i.total_amount-coalesce(p.paid,0),0)),0)::numeric(12,2) FROM invoices i LEFT JOIN (SELECT booking_id,sum(amount) AS paid FROM payments GROUP BY booking_id)p ON p.booking_id=i.booking_id WHERE i.status='Issued') AS invoice_outstanding,
 count(*)::int AS total_equipment,count(*) FILTER(WHERE availability='Available')::int AS available_equipment,count(*) FILTER(WHERE availability='Assigned')::int AS assigned_equipment,count(*) FILTER(WHERE availability='Maintenance')::int AS maintenance_equipment
 FROM (${equipmentSelect}) inventory`)
    ).rows[0],
  ),
);
