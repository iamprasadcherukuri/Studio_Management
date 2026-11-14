-- READ ONLY. Run against the chosen database; no customer names/contact details are returned.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path TO studio,public;
WITH
cash AS (SELECT booking_id,sum(amount) AS receipts FROM payments GROUP BY booking_id),
refund AS (SELECT p.booking_id,sum(r.amount) AS refunds FROM payment_reversals r JOIN payments p ON p.id=r.payment_id GROUP BY p.booking_id),
discounts AS (SELECT booking_id,sum(payment_discount_amount) AS payment_discounts FROM payments GROUP BY booking_id),
ledger AS (SELECT booking_id,sum(amount) AS net_received FROM payment_ledger GROUP BY booking_id),
expenses_by_booking AS (SELECT booking_id,sum(amount) AS expenses FROM expenses GROUP BY booking_id),
booking_totals AS (
 SELECT b.*,coalesce(c.receipts,0) AS receipts,coalesce(r.refunds,0) AS refunds,coalesce(d.payment_discounts,0) AS payment_discounts,
 coalesce(l.net_received,0) AS net_received,b.agreed_amount-coalesce(l.net_received,0) AS outstanding,
 b.discount_amount-coalesce(d.payment_discounts,0) AS inferred_booking_discount,coalesce(x.expenses,0) AS linked_expenses
 FROM bookings b LEFT JOIN cash c ON c.booking_id=b.id LEFT JOIN refund r ON r.booking_id=b.id
 LEFT JOIN discounts d ON d.booking_id=b.id LEFT JOIN ledger l ON l.booking_id=b.id LEFT JOIN expenses_by_booking x ON x.booking_id=b.id
),
refunds_by_payment AS (SELECT payment_id,sum(amount) AS amount FROM payment_reversals GROUP BY payment_id),
invoice_lines AS (SELECT invoice_id,sum(line_total) AS subtotal,count(*) AS lines FROM invoice_items GROUP BY invoice_id),
receipt_values AS (
 SELECT p.*,j,
 CASE WHEN j->>'gross_amount' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (j->>'gross_amount')::numeric END AS rg,
 CASE WHEN j->>'discount_amount' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (j->>'discount_amount')::numeric END AS rd,
 CASE WHEN j->>'final_amount' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (j->>'final_amount')::numeric END AS rn,
 CASE WHEN j->>'previously_paid' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (j->>'previously_paid')::numeric END AS rp,
 CASE WHEN j->>'current_payment' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (j->>'current_payment')::numeric END AS rc,
 CASE WHEN j->>'balance_due' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (j->>'balance_due')::numeric END AS rb
 FROM payments p CROSS JOIN LATERAL (SELECT p.receipt_snapshot AS j) s WHERE p.receipt_snapshot IS NOT NULL
),
issues AS (
 SELECT 'booking_discount_lost' AS check_name,'booking' AS entity,id::text AS id FROM booking_totals WHERE inferred_booking_discount<0
 UNION ALL SELECT 'booking_discount_metadata_mismatch','booking',id::text FROM booking_totals WHERE booking_discount_amount IS NOT NULL AND booking_discount_amount+payment_discounts<>discount_amount
 UNION ALL SELECT 'booking_amount_invalid','booking',id::text FROM booking_totals WHERE agreed_amount<0 OR total_amount<0 OR discount_amount<0 OR discount_value<0 OR total_amount-discount_amount<>agreed_amount
 OR (discount_type='NONE' AND (discount_value<>0 OR discount_amount<>0)) OR (discount_type='FIXED' AND discount_value<>discount_amount)
 OR (discount_type='PERCENTAGE' AND (discount_value>100 OR discount_amount<>round(total_amount*discount_value/100,2)))
 UNION ALL SELECT 'ledger_source_mismatch','booking',id::text FROM booking_totals WHERE net_received<>receipts-refunds
 UNION ALL SELECT 'negative_net_received','booking',id::text FROM booking_totals WHERE net_received<0
 UNION ALL SELECT 'overpayment','booking',id::text FROM booking_totals WHERE outstanding<0
 UNION ALL SELECT 'cancelled_booking_has_cash','booking',id::text FROM booking_totals WHERE status='cancelled' AND net_received<>0
 UNION ALL SELECT 'reversal_exceeds_payment','payment',p.id::text FROM payments p JOIN refunds_by_payment r ON r.payment_id=p.id WHERE r.amount>p.amount
 UNION ALL SELECT 'payment_amount_invalid','payment',id::text FROM payments WHERE amount<=0 OR payment_discount_amount<0 OR payment_discount_value<0 OR payment_discount_basis<0 OR payment_discount_amount>payment_discount_basis
 OR (payment_discount_type='NONE' AND (payment_discount_value<>0 OR payment_discount_amount<>0))
 OR (payment_discount_type='FIXED' AND payment_discount_value<>payment_discount_amount)
 OR (payment_discount_type='PERCENTAGE' AND (payment_discount_value>100 OR payment_discount_amount<>round(payment_discount_basis*payment_discount_value/100,2)))
 UNION ALL SELECT 'receipt_arithmetic_invalid','payment',id::text FROM receipt_values WHERE rg IS NULL OR rd IS NULL OR rn IS NULL OR rp IS NULL OR rc IS NULL OR rb IS NULL
 OR rg-rd<>rn OR rn-rp-rc<>rb OR rc<>amount OR (payment_type='Final' AND rb<>0) OR (j ? 'payment_discount_amount' AND j->>'payment_discount_amount'<>payment_discount_amount::text)
 UNION ALL SELECT 'active_invoice_booking_mismatch','invoice',i.id::text FROM invoices i JOIN bookings b ON b.id=i.booking_id WHERE i.status='Issued' AND (i.total_amount<>b.agreed_amount OR i.customer_id<>b.customer_id)
 UNION ALL SELECT 'invoice_lines_mismatch','invoice',i.id::text FROM invoices i LEFT JOIN invoice_lines l ON l.invoice_id=i.id WHERE coalesce(l.lines,0)=0 OR i.subtotal<>coalesce(l.subtotal,0)
 UNION ALL SELECT 'invoice_total_invalid','invoice',id::text FROM invoices WHERE total_amount<0 OR subtotal<0 OR discount<0 OR tax_amount<>0 OR subtotal-discount+tax_amount<>total_amount
 UNION ALL SELECT 'invoice_item_rounding_invalid','invoice_item',id::text FROM invoice_items WHERE quantity<=0 OR unit_price<0 OR line_total<>round(quantity*unit_price,2)
 UNION ALL SELECT 'linked_maintenance_expense_mismatch','maintenance',m.id::text FROM equipment_maintenance m JOIN expenses e ON e.id=m.expense_id WHERE e.amount<>m.maintenance_cost OR e.category<>'Equipment'
 UNION ALL SELECT 'expense_amount_invalid','expense',id::text FROM expenses WHERE amount<=0
 UNION ALL SELECT 'reversal_amount_invalid','reversal',id::text FROM payment_reversals WHERE amount<=0
 UNION ALL SELECT 'package_amount_invalid','package',id::text FROM packages WHERE amount<0
 UNION ALL SELECT 'negative_printing_estimate','album',id::text FROM albums WHERE printing_cost<0
 UNION ALL SELECT 'negative_purchase_cost','equipment',id::text FROM equipment WHERE purchase_cost<0
 UNION ALL SELECT 'negative_maintenance_estimate','maintenance',id::text FROM equipment_maintenance WHERE maintenance_cost<0
 UNION ALL SELECT 'orphan_payment','payment',p.id::text FROM payments p LEFT JOIN bookings b ON b.id=p.booking_id LEFT JOIN users u ON u.id=p.created_by WHERE b.id IS NULL OR u.id IS NULL
 UNION ALL SELECT 'orphan_reversal','reversal',r.id::text FROM payment_reversals r LEFT JOIN payments p ON p.id=r.payment_id WHERE p.id IS NULL
 UNION ALL SELECT 'orphan_invoice','invoice',i.id::text FROM invoices i LEFT JOIN bookings b ON b.id=i.booking_id LEFT JOIN customers c ON c.id=i.customer_id WHERE b.id IS NULL OR c.id IS NULL
 UNION ALL SELECT 'orphan_invoice_item','invoice_item',i.id::text FROM invoice_items i LEFT JOIN invoices p ON p.id=i.invoice_id WHERE p.id IS NULL
 UNION ALL SELECT 'orphan_expense_booking','expense',e.id::text FROM expenses e LEFT JOIN bookings b ON b.id=e.booking_id WHERE e.booking_id IS NOT NULL AND b.id IS NULL
 UNION ALL SELECT 'orphan_booking_reference','booking',b.id::text FROM bookings b LEFT JOIN customers c ON c.id=b.customer_id LEFT JOIN event_types e ON e.id=b.event_type_id LEFT JOIN packages p ON p.id=b.package_id WHERE c.id IS NULL OR e.id IS NULL OR (b.package_id IS NOT NULL AND p.id IS NULL)
 UNION ALL SELECT 'orphan_album_booking','album',a.id::text FROM albums a LEFT JOIN bookings b ON b.id=a.booking_id WHERE b.id IS NULL
 UNION ALL SELECT 'orphan_maintenance_reference','maintenance',m.id::text FROM equipment_maintenance m LEFT JOIN equipment e ON e.id=m.equipment_id LEFT JOIN expenses x ON x.id=m.expense_id WHERE e.id IS NULL OR (m.expense_id IS NOT NULL AND x.id IS NULL)
 UNION ALL SELECT 'duplicate_payment_key','payment',min(id)::text FROM payments GROUP BY idempotency_key HAVING count(*)>1
 UNION ALL SELECT 'duplicate_reversal_key','reversal',min(id)::text FROM payment_reversals GROUP BY idempotency_key HAVING count(*)>1
),
totals AS (
 SELECT coalesce(sum(total_amount),0) AS gross_booking_value,coalesce(sum(discount_amount),0) AS total_discount,
 coalesce(sum(inferred_booking_discount),0) AS inferred_booking_discount,coalesce(sum(payment_discounts),0) AS payment_discounts,
 coalesce(sum(receipts),0) AS original_cash_receipts,coalesce(sum(refunds),0) AS refunds,coalesce(sum(net_received),0) AS net_cash_receipts,
 coalesce(sum(outstanding) FILTER(WHERE status<>'cancelled'),0) AS active_outstanding,
 coalesce(sum(agreed_amount) FILTER(WHERE status<>'cancelled'),0)-coalesce(sum(net_received),0) AS dashboard_pending_formula,
 coalesce(sum(linked_expenses),0) AS booking_linked_expenses FROM booking_totals
)
SELECT jsonb_build_object(
 'generated_at',now(),'database',current_database(),'schema',current_schema(),'read_only',current_setting('transaction_read_only'),
 'financial_columns',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'precision',numeric_precision,'scale',numeric_scale,'generated',is_generated) ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema=current_schema() AND data_type='numeric'),
 'totals',(SELECT (SELECT jsonb_object_agg(key,to_jsonb(value#>>'{}')) FROM jsonb_each(to_jsonb(t)||jsonb_build_object('expenses_paid',(SELECT coalesce(sum(amount),0) FROM expenses),'net_cash_balance',t.net_cash_receipts-(SELECT coalesce(sum(amount),0) FROM expenses),'general_studio_expenses',(SELECT coalesce(sum(amount),0) FROM expenses WHERE booking_id IS NULL)))) FROM totals t),
 'violations',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY check_name,entity,id) FROM issues i),'[]'::jsonb),
 'unvalidated_constraints',(SELECT count(*) FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND NOT convalidated),
 'information',jsonb_build_object(
  'custom_or_historical_package_prices',(SELECT count(*) FROM bookings b JOIN packages p ON p.id=b.package_id WHERE b.total_amount<>p.amount),
  'invoice_gross_representation_differs',(SELECT count(*) FROM invoices i JOIN bookings b ON b.id=i.booking_id WHERE i.status='Issued' AND (i.subtotal<>b.total_amount OR i.discount<>b.discount_amount)),
  'payments_without_receipt_snapshot',(SELECT count(*) FROM payments WHERE receipt_snapshot IS NULL),
  'legacy_invoices_without_issue_snapshot',(SELECT count(*) FROM invoices WHERE financial_snapshot IS NULL),
  'payment_discounts_without_remarks',(SELECT count(*) FROM payments WHERE payment_discount_amount>0 AND nullif(trim(remarks),'') IS NULL),
  'future_dated_payments',(SELECT count(*) FROM payments WHERE date>(now() AT TIME ZONE 'Asia/Kolkata')::date),
  'future_dated_expenses',(SELECT count(*) FROM expenses WHERE date>(now() AT TIME ZONE 'Asia/Kolkata')::date),
  'possible_reused_transaction_references',(SELECT count(*) FROM (SELECT booking_id,date,amount,method,reference FROM payments WHERE nullif(trim(reference),'') IS NOT NULL GROUP BY booking_id,date,amount,method,reference HAVING count(*)>1) x)
 )) AS financial_audit;
ROLLBACK;
