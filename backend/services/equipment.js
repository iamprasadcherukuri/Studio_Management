import Decimal from "decimal.js";
import { pool, transaction } from "../database/pool.js";
import { fail } from "./records.js";
import { audit } from "./invoices.js";
import { validateRecordMasters } from "./master-values.js";
export const equipmentSelect = `SELECT e.*,CASE WHEN e.status='Available' AND EXISTS(SELECT 1 FROM equipment_assignments a WHERE a.equipment_id=e.id AND a.status='Active' AND a.assigned_date<=CURRENT_DATE) THEN 'Assigned' ELSE e.status END AS availability FROM equipment e`;
async function lockEquipment(c, id) {
  const row = (
    await c.query("SELECT * FROM equipment WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (!row) throw fail("Equipment not found", 404);
  return row;
}
export async function equipmentDetails(id) {
  const item = (await pool.query(equipmentSelect + " WHERE e.id=$1", [id]))
    .rows[0];
  if (!item) throw fail("Equipment not found", 404);
  item.assignments = (
    await pool.query(
      "SELECT a.*,c.name AS customer_name,u.name AS assigned_by_name FROM equipment_assignments a JOIN bookings b ON b.id=a.booking_id JOIN customers c ON c.id=b.customer_id JOIN users u ON u.id=a.assigned_by WHERE equipment_id=$1 ORDER BY a.id DESC",
      [id],
    )
  ).rows;
  item.maintenance = (
    await pool.query(
      "SELECT * FROM equipment_maintenance WHERE equipment_id=$1 ORDER BY id DESC",
      [id],
    )
  ).rows;
  return item;
}
export async function saveEquipment(data, user, id) {
  return transaction(async (c) => {
    let previous = null;
    if (id) {
      const old = await lockEquipment(c, id);
      previous = old;
      if (old.status === "Retired")
        throw fail(
          "Retired equipment is retained as history and cannot be edited",
        );
    }
    await validateRecordMasters(c, "equipment", data, previous);
    const keys = Object.keys(data);
    const values = Object.values(data);
    const query = id
      ? `UPDATE equipment SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")},updated_at=now() WHERE id=$${keys.length + 1} RETURNING *`
      : `INSERT INTO equipment(${keys.join(",")}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`;
    const row = (await c.query(query, id ? [...values, id] : values)).rows[0];
    await audit(c, user, id ? "update" : "create", "equipment", row.id);
    return row;
  });
}
export async function retireEquipment(id, user) {
  return transaction(async (c) => {
    const row = await lockEquipment(c, id);
    if (row.status === "Retired") return row;
    if (
      (
        await c.query(
          "SELECT 1 FROM equipment_assignments WHERE equipment_id=$1 AND status='Active'",
          [id],
        )
      ).rowCount ||
      row.status === "Maintenance"
    )
      throw fail(
        "Return all assignments and complete maintenance before retirement",
      );
    const result = (
      await c.query(
        "UPDATE equipment SET status='Retired',updated_at=now() WHERE id=$1 RETURNING *",
        [id],
      )
    ).rows[0];
    await audit(c, user, "retire", "equipment", id);
    return result;
  });
}
export async function assignEquipment(data, user) {
  return transaction(async (c) => {
    const equipment = await lockEquipment(c, data.equipment_id);
    if (equipment.status !== "Available")
      throw fail("Equipment is retired or under maintenance", 409);
    const booking = (
      await c.query(
        "SELECT event_date::text,status FROM bookings WHERE id=$1 FOR SHARE",
        [data.booking_id],
      )
    ).rows[0];
    if (!booking) throw fail("Booking not found", 404);
    if (booking.status === "cancelled")
      throw fail("Cannot assign equipment to cancelled bookings");
    if (
      booking.event_date < data.assigned_date ||
      booking.event_date > data.expected_return_date
    )
      throw fail("The reservation must include the booking event date");
    const conflicts = await c.query(
      "SELECT id FROM equipment_assignments WHERE equipment_id=$1 AND status='Active' AND (daterange(assigned_date,expected_return_date,'[]') && daterange($2::date,$3::date,'[]') OR expected_return_date<CURRENT_DATE)",
      [data.equipment_id, data.assigned_date, data.expected_return_date],
    );
    if (conflicts.rowCount)
      throw fail(
        "Equipment has an overlapping or overdue unreturned assignment",
        409,
      );
    const row = (
      await c.query(
        "INSERT INTO equipment_assignments(equipment_id,booking_id,assigned_by,assigned_date,expected_return_date,remarks) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          data.equipment_id,
          data.booking_id,
          user.id,
          data.assigned_date,
          data.expected_return_date,
          data.remarks,
        ],
      )
    ).rows[0];
    await audit(c, user, "assign", "equipment_assignments", row.id);
    return row;
  });
}
export async function returnEquipment(id, date, user) {
  return transaction(async (c) => {
    const first = (
      await c.query(
        "SELECT equipment_id FROM equipment_assignments WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (!first) throw fail("Assignment not found", 404);
    await lockEquipment(c, first.equipment_id);
    const row = (
      await c.query(
        "SELECT *,CURRENT_DATE::text AS today FROM equipment_assignments WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (date < row.assigned_date || date > row.today)
      throw fail("Return date must be between assignment date and today");
    if (row.status === "Returned") {
      if (row.actual_return_date !== date)
        throw fail("Assignment has already been returned", 409);
      return row;
    }
    const result = (
      await c.query(
        "UPDATE equipment_assignments SET actual_return_date=$1,status='Returned',updated_at=now() WHERE id=$2 RETURNING *",
        [date, id],
      )
    ).rows[0];
    await audit(c, user, "return", "equipment_assignments", id);
    return result;
  });
}
export async function createMaintenance(data, user) {
  return transaction(async (c) => {
    const item = await lockEquipment(c, data.equipment_id);
    if (item.status === "Retired")
      throw fail("Retired equipment cannot enter maintenance");
    if (
      (
        await c.query(
          "SELECT id FROM equipment_assignments WHERE equipment_id=$1 AND status='Active'",
          [item.id],
        )
      ).rowCount
    )
      throw fail(
        "Return or resolve active reservations before servicing equipment",
        409,
      );
    const keys = Object.keys(data);
    const row = (
      await c.query(
        `INSERT INTO equipment_maintenance(${keys.join(",")},created_by) VALUES(${keys.map((_, i) => `$${i + 1}`).join(",")},$${keys.length + 1}) RETURNING *`,
        [...Object.values(data), user.id],
      )
    ).rows[0];
    if (data.status === "In progress")
      await c.query(
        "UPDATE equipment SET status='Maintenance',updated_at=now() WHERE id=$1",
        [item.id],
      );
    await audit(c, user, "create", "equipment_maintenance", row.id);
    return row;
  });
}
export async function updateMaintenance(id, data, user) {
  return transaction(async (c) => {
    const first = (
      await c.query(
        "SELECT equipment_id FROM equipment_maintenance WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (!first) throw fail("Maintenance record not found", 404);
    const item = await lockEquipment(c, first.equipment_id);
    const row = (
      await c.query(
        "SELECT * FROM equipment_maintenance WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (data.next_service_date && data.next_service_date < row.service_date)
      throw fail("Next service date cannot precede service date");
    if (row.status === "Completed" && data.status !== "Completed")
      throw fail("Completed maintenance cannot be reopened; add a new service");
    const result = (
      await c.query(
        "UPDATE equipment_maintenance SET status=$1,next_service_date=$2,updated_at=now() WHERE id=$3 RETURNING *",
        [data.status, data.next_service_date, id],
      )
    ).rows[0];
    if (
      row.status === "In progress" &&
      data.status === "Completed" &&
      item.status === "Maintenance"
    )
      await c.query(
        "UPDATE equipment SET status='Available',updated_at=now() WHERE id=$1",
        [item.id],
      );
    await audit(c, user, "update", "equipment_maintenance", id);
    return result;
  });
}
export async function postMaintenanceExpense(id, data, user) {
  return transaction(async (c) => {
    const row = (
      await c.query(
        "SELECT * FROM equipment_maintenance WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!row) throw fail("Maintenance record not found", 404);
    if (row.expense_id)
      throw fail("This maintenance already has a paid expense", 409);
    if (new Decimal(row.maintenance_cost).lte(0))
      throw fail("Maintenance cost must be positive to record an expense");
    let expense;
    if (data.existing_expense_id) {
      expense = (
        await c.query("SELECT * FROM expenses WHERE id=$1 FOR UPDATE", [
          data.existing_expense_id,
        ])
      ).rows[0];
      if (!expense) throw fail("Expense not found", 404);
      if (
        expense.category !== "Equipment" ||
        !new Decimal(expense.amount).eq(row.maintenance_cost)
      )
        throw fail("Select an Equipment expense matching the maintenance cost");
    } else {
      if (!data.date || !data.method)
        throw fail("Payment date and method are required");
      expense = (
        await c.query(
          "INSERT INTO expenses(date,category,description,amount,method,remarks) VALUES($1,'Equipment',$2,$3,$4,$5) RETURNING *",
          [
            data.date,
            row.description,
            row.maintenance_cost,
            data.method,
            `Equipment maintenance #${row.id}`,
          ],
        )
      ).rows[0];
      await audit(c, user, "create", "expenses", expense.id);
    }
    await c.query(
      "UPDATE equipment_maintenance SET expense_id=$1,updated_at=now() WHERE id=$2",
      [expense.id, id],
    );
    await audit(c, user, "link_expense", "equipment_maintenance", id);
    return expense;
  });
}
