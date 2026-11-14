import { pool } from "../database/pool.js";
import { migrationVersions } from "../database/versions.js";
export async function databaseReady() {
  const result = await pool.query({
    text: "SELECT count(*)::int n FROM schema_migrations WHERE version=ANY($1::text[])",
    values: [migrationVersions],
    query_timeout: 5000,
  });
  if (result.rows[0].n !== migrationVersions.length) return false;
  await pool.query({
    text: "SELECT l.amount,p.receipt_snapshot,p.payment_discount_type,p.payment_discount_value,p.payment_discount_amount,p.payment_discount_basis,b.total_amount,b.booking_discount_type,b.booking_discount_value,b.booking_discount_amount,i.financial_snapshot,e.idempotency_key,e.request_hash,a.cancelled_at,a.cancelled_by,a.cancellation_reason,s.logo_asset_id,v.value_code,k.package_type,u.password_version,log.details FROM payment_ledger l CROSS JOIN payments p CROSS JOIN bookings b CROSS JOIN invoices i CROSS JOIN expenses e CROSS JOIN equipment_assignments a CROSS JOIN studio_settings s CROSS JOIN master_entity_value v CROSS JOIN master_entity me CROSS JOIN packages k CROSS JOIN users u CROSS JOIN audit_logs log LIMIT 0",
    query_timeout: 5000,
  });
  const constraints = [
    "bookings_receipt_discount_consistency",
    "payment_discount_consistency",
    "booking_discount_metadata",
    "expense_request_pair",
    "equipment_assignment_lifecycle",
    "payments_idempotency_key_key",
    "payments_receipt_number_key",
    "payment_reversals_idempotency_key_key",
    "expenses_idempotency_key_key",
  ];
  const valid = (
    await pool.query({
      text: "SELECT count(*)::int n FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND conname=ANY($1::text[]) AND convalidated",
      values: [constraints],
      query_timeout: 5000,
    })
  ).rows[0].n;
  if (valid !== constraints.length) return false;
  const index = (
    await pool.query({
      text: "SELECT 1 FROM pg_index x JOIN pg_class c ON c.oid=x.indexrelid WHERE c.relnamespace=current_schema()::regnamespace AND c.relname='invoices_one_active_booking' AND x.indisunique AND x.indisvalid AND x.indpred IS NOT NULL",
      query_timeout: 5000,
    })
  ).rowCount;
  const triggers = [
    "guard_last_administrator",
    "protect_invoice_financials",
    "protect_invoice_items",
    "protect_payment_discount",
    "protect_receipt_snapshot",
    "guard_granted_discounts",
  ];
  const triggerCount = (
    await pool.query({
      text: "SELECT count(*)::int n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=current_schema()::regnamespace AND t.tgname=ANY($1::text[]) AND t.tgenabled IN ('O','A')",
      values: [triggers],
      query_timeout: 5000,
    })
  ).rows[0].n;
  return Boolean(index) && triggerCount === triggers.length;
}
