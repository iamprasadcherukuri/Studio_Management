import { transaction } from "../database/pool.js";
export const definitions = {
  customers: {
    table: "customers",
    search: "t.name || ' ' || t.mobile",
    select: "t.*",
  },
  bookings: {
    table: "bookings",
    search: "c.name || ' ' || t.location || ' ' || e.name",
    join: "JOIN customers c ON c.id=t.customer_id JOIN event_types e ON e.id=t.event_type_id LEFT JOIN packages p ON p.id=t.package_id",
    select:
      "t.*,c.name AS customer_name,e.name AS event_type,p.name AS package_name,COALESCE((SELECT sum(amount) FROM payments WHERE booking_id=t.id),0) AS paid,t.agreed_amount-COALESCE((SELECT sum(amount) FROM payments WHERE booking_id=t.id),0) AS outstanding,ARRAY(SELECT staff_id FROM booking_staff WHERE booking_id=t.id) AS staff_ids",
  },
  payments: {
    table: "payments",
    search: "c.name || ' ' || t.method || ' ' || coalesce(t.reference,'')",
    join: "JOIN bookings b ON b.id=t.booking_id JOIN customers c ON c.id=b.customer_id",
    select: "t.*,c.name AS customer_name,b.agreed_amount",
  },
  albums: {
    table: "albums",
    search: "c.name || ' ' || t.album_type || ' ' || t.status",
    join: "JOIN bookings b ON b.id=t.booking_id JOIN customers c ON c.id=b.customer_id",
    select: "t.*,c.name AS customer_name",
  },
  expenses: {
    table: "expenses",
    search: "t.description || ' ' || t.category",
    select: "t.*",
  },
  packages: { table: "packages", search: "t.name", select: "t.*" },
  staff: { table: "staff", search: "t.name", select: "t.*" },
};
export function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
export async function writeRecord(kind, data, user, recordId) {
  return transaction(async (client) => {
    const table = definitions[kind].table;
    const { staff_ids, ...values } = data;
    if (kind === "payments") {
      await client.query("SELECT id FROM bookings WHERE id=$1 FOR UPDATE", [
        data.booking_id,
      ]);
      const duplicate = await client.query(
        "SELECT * FROM payments WHERE idempotency_key=$1",
        [data.idempotency_key],
      );
      if (duplicate.rows[0]) {
        const old = duplicate.rows[0];
        const oldDate =
          typeof old.date === "string"
            ? old.date.slice(0, 10)
            : [
                old.date.getFullYear(),
                String(old.date.getMonth() + 1).padStart(2, "0"),
                String(old.date.getDate()).padStart(2, "0"),
              ].join("-");
        if (
          old.booking_id !== data.booking_id ||
          Number(old.amount) !== data.amount ||
          oldDate !== data.date ||
          old.method !== data.method ||
          (old.reference || null) !== data.reference ||
          (old.remarks || null) !== data.remarks
        )
          throw fail("This submission key is already used");
        return old;
      }
      const { rows } = await client.query(
        "SELECT status,agreed_amount-COALESCE((SELECT sum(amount) FROM payments WHERE booking_id=b.id),0) AS due FROM bookings b WHERE id=$1",
        [data.booking_id],
      );
      if (!rows[0]) throw fail("Booking not found", 404);
      if (rows[0].status === "cancelled")
        throw fail("Cannot receive payments for a cancelled booking");
      if (data.amount > Number(rows[0].due))
        throw fail("Payment exceeds the outstanding balance");
      values.created_by = user.id;
    }
    if (kind === "bookings" && recordId) {
      await client.query("SELECT id FROM bookings WHERE id=$1 FOR UPDATE", [
        recordId,
      ]);
      const { rows } = await client.query(
        "SELECT COALESCE(sum(amount),0) AS paid FROM payments WHERE booking_id=$1",
        [recordId],
      );
      if (data.agreed_amount < Number(rows[0].paid))
        throw fail("Agreed amount cannot be below payments already received");
      if (data.status === "cancelled" && Number(rows[0].paid) > 0)
        throw fail(
          "A paid booking cannot be cancelled; resolve its payments first",
        );
    }
    const keys = Object.keys(values);
    const params = Object.values(values);
    const sql = recordId
      ? `UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")} WHERE id=$${keys.length + 1} RETURNING *`
      : `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`;
    const { rows } = await client.query(
      sql,
      recordId ? [...params, recordId] : params,
    );
    if (!rows[0]) throw fail("Record not found", 404);
    if (kind === "bookings") {
      await client.query("DELETE FROM booking_staff WHERE booking_id=$1", [
        rows[0].id,
      ]);
      for (const staffId of staff_ids)
        await client.query(
          "INSERT INTO booking_staff(booking_id,staff_id) VALUES($1,$2)",
          [rows[0].id, staffId],
        );
    }
    await client.query(
      "INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES($1,$2,$3,$4)",
      [user.id, recordId ? "update" : "create", kind, rows[0].id],
    );
    return rows[0];
  });
}
