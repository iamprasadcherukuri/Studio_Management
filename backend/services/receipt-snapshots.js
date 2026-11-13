import Decimal from "decimal.js";
import { pool, transaction } from "../database/pool.js";
import { amountInWords } from "./amount-words.js";
const fixed = (value) => new Decimal(value || 0).toFixed(2);
export function legacyReceiptNumber(id) {
  return "PAY-" + String(id).padStart(5, "0");
}
export async function recordReceipt(client, id, recorded = false) {
  let saved = (
    await client.query(
      "SELECT receipt_snapshot AS snapshot,receipt_basis AS basis FROM payments WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (saved?.snapshot) return saved;
  const payment = (
    await client.query("SELECT booking_id FROM payments WHERE id=$1", [id])
  ).rows[0];
  if (!payment)
    throw Object.assign(new Error("Payment not found"), { status: 404 });
  await client.query("SELECT id FROM bookings WHERE id=$1 FOR UPDATE", [
    payment.booking_id,
  ]);
  saved = (
    await client.query(
      "SELECT receipt_snapshot AS snapshot,receipt_basis AS basis FROM payments WHERE id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
  if (saved?.snapshot) return saved;
  const row = (
    await client.query(
      `SELECT p.*,c.name AS customer_name,c.customer_code,c.mobile,c.email,c.address,
 b.agreed_amount,b.discount_amount,b.discount_type,b.discount_value,b.event_date,b.location,e.name AS event_type,k.name AS package_name,
 to_char(b.created_at AT TIME ZONE 'Asia/Kolkata','YYYY') AS booking_year,to_char(p.created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS receipt_date
 FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN customers c ON c.id=b.customer_id JOIN event_types e ON e.id=b.event_type_id LEFT JOIN packages k ON k.id=b.package_id WHERE p.id=$1`,
      [id],
    )
  ).rows[0];
  const studio = (
    await client.query(
      "SELECT name,phone,email,address,tagline,logo_asset_id,signatory_name,signatory_title,receipt_footer FROM studio_settings WHERE id=1",
    )
  ).rows[0];
  const earlier = recorded
    ? "NOT (entry_type='Payment' AND payment_id=$2)"
    : "((entry_type='Payment' AND payment_id<$2) OR (entry_type='Reversal' AND created_at<=$3))";
  const params = recorded
    ? [row.booking_id, id]
    : [row.booking_id, id, row.created_at];
  const previous = (
    await client.query(
      `SELECT coalesce(sum(amount),0)::numeric(12,2) AS paid FROM payment_ledger WHERE booking_id=$1 AND ${earlier}`,
      params,
    )
  ).rows[0].paid;
  const gross = new Decimal(row.agreed_amount).plus(row.discount_amount);
  const snapshot = {
    version: 1,
    receipt_number: row.receipt_number || legacyReceiptNumber(row.id),
    payment_id: row.id,
    booking_id: row.booking_id,
    booking_number:
      "BK-" + row.booking_year + "-" + String(row.booking_id).padStart(3, "0"),
    date: row.date,
    receipt_date: row.receipt_date,
    customer: {
      name: row.customer_name,
      code: row.customer_code,
      mobile: row.mobile,
      email: row.email,
      address: row.address,
    },
    studio,
    event_type: row.event_type,
    event_date: row.event_date,
    venue: row.location,
    description: row.package_name || row.event_type + " Photography Package",
    gross_amount: gross.toFixed(2),
    discount_type: row.discount_type,
    discount_value: fixed(row.discount_value),
    discount_amount: fixed(row.discount_amount),
    discount_percent: gross.gt(0)
      ? new Decimal(row.discount_amount)
          .div(gross)
          .times(100)
          .toDecimalPlaces(2)
          .toString()
      : "0",
    final_amount: fixed(row.agreed_amount),
    previously_paid: fixed(previous),
    current_payment: fixed(row.amount),
    balance_due: new Decimal(row.agreed_amount)
      .minus(previous)
      .minus(row.amount)
      .toFixed(2),
    payment_type: row.payment_type,
    method: row.method,
    reference: row.reference,
    remarks: row.remarks,
    amount_in_words: amountInWords(row.amount),
  };
  return (
    await client.query(
      "UPDATE payments SET receipt_snapshot=$2,receipt_basis=$3 WHERE id=$1 RETURNING receipt_snapshot AS snapshot,receipt_basis AS basis",
      [id, snapshot, recorded ? "recorded" : "reconstructed"],
    )
  ).rows[0];
}
export async function receiptDetails(id) {
  const saved = await transaction((client) => recordReceipt(client, id, false));
  const snapshot = saved.snapshot;
  const reversed = (
    await pool.query(
      "SELECT coalesce(sum(amount),0)::numeric(12,2) AS amount FROM payment_reversals WHERE payment_id=$1",
      [id],
    )
  ).rows[0].amount;
  let logo = null;
  if (snapshot.studio.logo_asset_id)
    logo =
      (
        await pool.query(
          "SELECT image_data FROM studio_brand_assets WHERE id=$1",
          [snapshot.studio.logo_asset_id],
        )
      ).rows[0]?.image_data || null;
  return {
    ...snapshot,
    amount: snapshot.current_payment,
    agreed_amount: snapshot.final_amount,
    customer_name: snapshot.customer.name,
    reversed_amount: reversed,
    payment_status: new Decimal(reversed).gte(snapshot.current_payment)
      ? "Fully Reversed"
      : new Decimal(reversed).gt(0)
        ? "Partially Reversed"
        : "Payment Received",
    logo,
    basis: saved.basis,
  };
}
