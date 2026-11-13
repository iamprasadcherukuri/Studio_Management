import Decimal from 'decimal.js';
import {createHash} from 'node:crypto';
import {pool,transaction} from '../database/pool.js';
import {fail} from './records.js';
export async function audit(c,user,action,entity,id){await c.query('INSERT INTO audit_logs(user_id,action,entity,entity_id) VALUES($1,$2,$3,$4)',[user.id,action,entity,id]);}
export const invoiceSelect=`SELECT i.*,i.customer_snapshot->>'name' AS customer_name,
 COALESCE(p.paid,0)::numeric(12,2) AS paid_amount,
 CASE WHEN i.status='Void' THEN 0 ELSE greatest(i.total_amount-COALESCE(p.paid,0),0) END::numeric(12,2) AS balance_amount,
 CASE WHEN i.status='Void' THEN 'Void' WHEN COALESCE(p.paid,0)>=i.total_amount THEN 'Paid' WHEN i.due_date<CURRENT_DATE THEN 'Overdue' WHEN COALESCE(p.paid,0)>0 THEN 'Part paid' ELSE 'Unpaid' END AS payment_status
 FROM invoices i LEFT JOIN (SELECT booking_id,sum(amount) AS paid FROM payments GROUP BY booking_id) p ON p.booking_id=i.booking_id`;
export async function invoiceDetails(id){
 const {rows}=await pool.query(invoiceSelect+' WHERE i.id=$1',[id]);if(!rows[0])throw fail('Invoice not found',404);
 rows[0].items=(await pool.query('SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id',[id])).rows;
 rows[0].history=(await pool.query("SELECT a.action,a.created_at,u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.entity='invoices' AND a.entity_id=$1 ORDER BY a.id",[id])).rows;
 return rows[0];
}
export async function createInvoice(data,user){
 const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const id=await transaction(async c=>{
  const booking=(await c.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE',[data.booking_id])).rows[0];
  if(!booking)throw fail('Booking not found',404);
  const previous=(await c.query('SELECT id,request_hash FROM invoices WHERE idempotency_key=$1',[data.idempotency_key])).rows[0];
  if(previous){if(previous.request_hash!==hash)throw fail('This submission key was already used for another invoice',409);return previous.id;}
  if(booking.status==='cancelled')throw fail('Cannot invoice a cancelled booking');
  if((await c.query("SELECT id FROM invoices WHERE booking_id=$1 AND status='Issued'",[booking.id])).rowCount)throw fail('This booking already has an active invoice; void it before issuing a replacement',409);
  const items=data.items.map(item=>({...item,line_total:new Decimal(item.quantity).times(item.unit_price).toDecimalPlaces(2,Decimal.ROUND_HALF_UP).toFixed(2)}));
  const subtotal=items.reduce((sum,item)=>sum.plus(item.line_total),new Decimal(0));
  const total=subtotal.minus(data.discount);
  if(total.isNegative())throw fail('Discount cannot exceed the subtotal');
  if(!total.equals(booking.agreed_amount))throw fail('Invoice total must equal the agreed booking amount; adjust the item prices or discount');
  const customer=(await c.query('SELECT customer_code,name,mobile,email,address FROM customers WHERE id=$1',[booking.customer_id])).rows[0];
  const studio=(await c.query('SELECT name,phone,email,address FROM studio_settings WHERE id=1')).rows[0];
  const {rows}=await c.query('INSERT INTO invoices(booking_id,customer_id,invoice_date,due_date,studio_snapshot,customer_snapshot,subtotal,discount,total_amount,terms,idempotency_key,request_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id',[booking.id,booking.customer_id,data.invoice_date,data.due_date,studio,customer,subtotal.toFixed(2),data.discount,total.toFixed(2),data.terms,data.idempotency_key,hash,user.id]);
  for(const item of items)await c.query('INSERT INTO invoice_items(invoice_id,description,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5)',[rows[0].id,item.description,item.quantity,item.unit_price,item.line_total]);
  await audit(c,user,'create','invoices',rows[0].id);return rows[0].id;
 });
 return invoiceDetails(id);
}
export async function voidInvoice(id,reason,user){await transaction(async c=>{
 // Match invoice creation lock order: booking, then invoice.
 const row=(await c.query('SELECT booking_id FROM invoices WHERE id=$1',[id])).rows[0];if(!row)throw fail('Invoice not found',404);
 await c.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE',[row.booking_id]);
 const old=(await c.query('SELECT status FROM invoices WHERE id=$1 FOR UPDATE',[id])).rows[0];if(old.status==='Void')return;
 await c.query("UPDATE invoices SET status='Void',void_reason=$1,voided_by=$2,voided_at=now(),updated_at=now() WHERE id=$3",[reason,user.id,id]);await audit(c,user,'void','invoices',id);
 });return invoiceDetails(id);}
export async function receiptDetails(id){const {rows}=await pool.query(`SELECT p.*,c.name AS customer_name,c.mobile,c.email,c.address,b.agreed_amount,(SELECT COALESCE(sum(amount),0) FROM payments WHERE booking_id=p.booking_id)::numeric(12,2) AS paid_amount FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN customers c ON c.id=b.customer_id WHERE p.id=$1`,[id]);if(!rows[0])throw fail('Payment not found',404);return {...rows[0],receipt_number:'RCPT-'+String(rows[0].id).padStart(8,'0'),studio:(await pool.query('SELECT name,phone,email,address FROM studio_settings WHERE id=1')).rows[0]};}
