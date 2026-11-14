import { transaction } from "../database/pool.js";
import { recordReceipt } from "./receipt-snapshots.js";
import { bookingPricing, bookingDiscountMetadata } from "./booking-pricing.js";
import { lockScheduling, updateBookingReservations } from "./scheduling.js";
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { validateRecordMasters } from "./master-values.js";
import { paymentDiscount } from "./payment-discount.js";
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
      "t.*,coalesce((SELECT sum(payment_discount_amount) FROM payments WHERE booking_id=t.id),0) AS payment_discounts,coalesce(t.booking_discount_amount,t.discount_amount-coalesce((SELECT sum(payment_discount_amount) FROM payments WHERE booking_id=t.id),0)) AS booking_discount_amount,c.name AS customer_name,e.name AS event_type,p.name AS package_name,COALESCE((SELECT sum(amount) FROM payment_ledger WHERE booking_id=t.id),0) AS paid,t.agreed_amount-COALESCE((SELECT sum(amount) FROM payment_ledger WHERE booking_id=t.id),0) AS outstanding,ARRAY(SELECT staff_id FROM booking_staff WHERE booking_id=t.id) AS staff_ids",
  },
  payments: {
    table: "payments",
    search:
      "c.name || ' ' || t.method || ' ' || coalesce(t.reference,'') || ' ' || coalesce(t.receipt_number,'PAY-' || lpad(t.id::text,greatest(5,length(t.id::text)),'0'))",
    join: "JOIN bookings b ON b.id=t.booking_id JOIN customers c ON c.id=b.customer_id",
    select:
      "t.*,COALESCE(t.receipt_number,'PAY-'||lpad(t.id::text,greatest(5,length(t.id::text)),'0')) AS receipt_number,c.name AS customer_name,b.agreed_amount,COALESCE((SELECT sum(amount) FROM payment_reversals WHERE payment_id=t.id),0)::numeric(12,2) AS reversed_amount,(t.amount-COALESCE((SELECT sum(amount) FROM payment_reversals WHERE payment_id=t.id),0))::numeric(12,2) AS net_amount",
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
    if (kind === "expenses" && !recordId && !data.idempotency_key)
      throw fail(
        "An expense submission key is required; refresh the form and try again",
      );
    if (kind === "expenses" && !recordId && data.idempotency_key) {
      const { idempotency_key, ...payload } = data;
      const hash = createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext(current_schema()||':expense:'||$1))",
        [idempotency_key],
      );
      const old = (
        await client.query("SELECT * FROM expenses WHERE idempotency_key=$1", [
          idempotency_key,
        ])
      ).rows[0];
      if (old) {
        if (old.request_hash !== hash)
          throw fail(
            "This expense submission key is already used for different details",
            409,
          );
        return old;
      }
      values.request_hash = hash;
    }
    if (kind === "expenses" && recordId) delete values.idempotency_key;
    if (kind === "bookings") {
      if (recordId) await lockScheduling(client);
      const old = recordId
        ? (
            await client.query(
              "SELECT * FROM bookings WHERE id=$1 FOR UPDATE",
              [recordId],
            )
          ).rows[0]
        : null;
      if (recordId && !old) throw fail("Record not found", 404);
      const granted = recordId
        ? (
            await client.query(
              "SELECT coalesce(sum(payment_discount_amount),0) amount FROM payments WHERE booking_id=$1",
              [recordId],
            )
          ).rows[0].amount
        : 0;
      Object.assign(values, bookingPricing(data, old, granted));
      if (old) await updateBookingReservations(client, old, data, user);
      delete values.total_amount;
    }
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
          old.payment_type !== data.payment_type ||
          old.payment_discount_type !== data.payment_discount_type ||
          !new Decimal(old.payment_discount_value).eq(
            data.payment_discount_value,
          ) ||
          (old.reference || null) !== data.reference ||
          (old.remarks || null) !== data.remarks
        )
          throw fail("This submission key is already used");
        return old;
      }
      const { rows } = await client.query(
        "SELECT b.*,agreed_amount-COALESCE((SELECT sum(amount) FROM payment_ledger WHERE booking_id=b.id),0) AS due FROM bookings b WHERE id=$1",
        [data.booking_id],
      );
      if (!rows[0]) throw fail("Booking not found", 404);
      if (rows[0].status === "cancelled")
        throw fail("Cannot receive payments for a cancelled booking");
      const discount = paymentDiscount(
        rows[0].due,
        data.payment_discount_type,
        data.payment_discount_value,
      );
      if (new Decimal(data.amount).gt(discount.remaining))
        throw fail("Payment exceeds the outstanding balance");
      if (
        data.payment_type === "Final" &&
        !new Decimal(data.amount).eq(discount.remaining)
      )
        throw fail("A final payment must settle the outstanding balance");
      values.payment_discount_amount = discount.amount;
      values.payment_discount_basis = discount.basis;
      if (new Decimal(discount.amount).gt(0)) {
        if (
          (
            await client.query(
              "SELECT id FROM invoices WHERE booking_id=$1 AND status='Issued'",
              [data.booking_id],
            )
          ).rowCount
        )
          throw fail(
            "Void the active invoice before applying a payment discount, then issue a replacement invoice.",
            409,
          );
        const cumulative = new Decimal(rows[0].discount_amount)
          .plus(discount.amount)
          .toFixed(2);
        const priorGranted = (
          await client.query(
            "SELECT coalesce(sum(payment_discount_amount),0) amount FROM payments WHERE booking_id=$1",
            [data.booking_id],
          )
        ).rows[0].amount;
        const meta = bookingDiscountMetadata(rows[0], priorGranted);
        await client.query(
          "UPDATE bookings SET agreed_amount=agreed_amount-$1,discount_amount=$2,discount_type='FIXED',discount_value=$2,booking_discount_type=$4,booking_discount_value=$5,booking_discount_amount=$6,updated_at=now() WHERE id=$3",
          [
            discount.amount,
            cumulative,
            data.booking_id,
            meta.booking_discount_type,
            meta.booking_discount_value,
            meta.booking_discount_amount,
          ],
        );
        await client.query(
          "INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES($1,$2,'bookings',$3)",
          [
            user.id,
            `payment discount ${discount.amount}; basis ${discount.basis}; submission ${data.idempotency_key}`,
            data.booking_id,
          ],
        );
      }
      values.created_by = user.id;
    }
    if (kind === "bookings" && recordId) {
      await client.query("SELECT id FROM bookings WHERE id=$1 FOR UPDATE", [
        recordId,
      ]);
      const { rows } = await client.query(
        "SELECT COALESCE(sum(amount),0) AS paid FROM payment_ledger WHERE booking_id=$1",
        [recordId],
      );
      if (new Decimal(values.agreed_amount).lt(rows[0].paid))
        throw fail("Agreed amount cannot be below payments already received");
      if (data.status === "cancelled" && Number(rows[0].paid) > 0)
        throw fail(
          "A paid booking cannot be cancelled; resolve its payments first",
        );
    }
    const previous = recordId
      ? (
          await client.query(`SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [
            recordId,
          ])
        ).rows[0]
      : null;
    if (kind === "albums") {
      const booking = (
        await client.query(
          "SELECT status FROM bookings WHERE id=$1 FOR SHARE",
          [data.booking_id],
        )
      ).rows[0];
      if (!booking) throw fail("Booking not found", 404);
      if (
        data.status === "Delivered" &&
        booking.status === "cancelled" &&
        !(
          previous?.status === "Delivered" &&
          previous.booking_id === data.booking_id &&
          previous.actual_delivery === data.actual_delivery &&
          previous.acknowledgement === data.acknowledgement
        )
      )
        throw fail("A cancelled booking cannot be newly marked Delivered");
    }
    await validateRecordMasters(client, kind, values, previous);
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
    if (kind === "payments") await recordReceipt(client, rows[0].id, true);
    await client.query(
      "INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES($1,$2,$3,$4)",
      [user.id, recordId ? "update" : "create", kind, rows[0].id],
    );
    return rows[0];
  });
}
