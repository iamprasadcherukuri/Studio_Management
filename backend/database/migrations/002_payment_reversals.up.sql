CREATE TABLE payment_reversals (
 id BIGSERIAL PRIMARY KEY,
 payment_id INTEGER NOT NULL REFERENCES payments(id),
 date DATE NOT NULL,
 amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
 reason TEXT NOT NULL CHECK(length(trim(reason))>=3),
 idempotency_key UUID UNIQUE NOT NULL,
 request_hash TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_reversals_payment_idx ON payment_reversals(payment_id);
CREATE INDEX payment_reversals_date_idx ON payment_reversals(date);
CREATE VIEW payment_ledger AS
 SELECT p.id::bigint AS id,p.id AS payment_id,NULL::bigint AS reversal_id,
 p.booking_id,p.date,p.amount,p.method,p.created_by,p.created_at,'Payment'::text AS entry_type
 FROM payments p
 UNION ALL
 SELECT -r.id,p.id,r.id,p.booking_id,r.date,-r.amount,p.method,r.created_by,r.created_at,'Reversal'::text
 FROM payment_reversals r JOIN payments p ON p.id=r.payment_id;
