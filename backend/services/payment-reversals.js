import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { z } from "zod";
import { pool, transaction } from "../database/pool.js";
import { fail } from "./records.js";
const inputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (value) =>
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value,
      "Invalid date",
    ),
  amount: z
    .union([z.string(), z.number().finite()])
    .transform(String)
    .refine(
      (value) =>
        /^\d{1,10}(\.\d{1,2})?$/.test(value) && new Decimal(value).gt(0),
      "Use a positive amount with at most two decimals",
    ),
  reason: z.string().trim().min(3).max(1000),
  idempotency_key: z.uuid(),
});
export async function reversePayment(paymentId, body, user) {
  const id = Number(paymentId);
  if (!Number.isSafeInteger(id) || id <= 0) throw fail("Invalid payment ID");
  const data = inputSchema.parse(body),
    hash = createHash("sha256")
      .update(JSON.stringify({ ...data, payment_id: id }))
      .digest("hex");
  return transaction(async (c) => {
    const first = (
      await c.query("SELECT booking_id FROM payments WHERE id=$1", [id])
    ).rows[0];
    if (!first) throw fail("Payment not found", 404);
    // Match existing payment-write lock order so balances cannot race new receipts.
    await c.query("SELECT id FROM bookings WHERE id=$1 FOR UPDATE", [
      first.booking_id,
    ]);
    const payment = (
      await c.query(
        "SELECT *,((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date)::text AS today FROM payments WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    const previous = (
      await c.query(
        "SELECT * FROM payment_reversals WHERE idempotency_key=$1",
        [data.idempotency_key],
      )
    ).rows[0];
    if (previous) {
      if (previous.request_hash !== hash)
        throw fail("This submission key belongs to a different reversal", 409);
      return previous;
    }
    if (data.date < payment.date || data.date > payment.today)
      throw fail("Reversal date must be between the payment date and today");
    const reversed = (
      await c.query(
        "SELECT coalesce(sum(amount),0)::numeric(12,2) AS amount FROM payment_reversals WHERE payment_id=$1",
        [id],
      )
    ).rows[0].amount;
    const remaining = new Decimal(payment.amount).minus(reversed);
    if (new Decimal(data.amount).gt(remaining))
      throw fail("Reversal exceeds the unreversed payment amount", 409);
    const row = (
      await c.query(
        "INSERT INTO payment_reversals(payment_id,date,amount,reason,idempotency_key,request_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          id,
          data.date,
          data.amount,
          data.reason,
          data.idempotency_key,
          hash,
          user.id,
        ],
      )
    ).rows[0];
    await c.query(
      "INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES($1,'reverse_payment','payment_reversals',$2)",
      [user.id, row.id],
    );
    return row;
  });
}
export async function reversalHistory(id) {
  return (
    await pool.query(
      "SELECT r.*,u.name AS created_by_name FROM payment_reversals r JOIN users u ON u.id=r.created_by WHERE payment_id=$1 ORDER BY r.id DESC",
      [id],
    )
  ).rows;
}
