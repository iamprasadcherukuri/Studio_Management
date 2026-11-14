DO $$ BEGIN IF EXISTS(SELECT 1 FROM payments WHERE payment_discount_amount<>0) THEN RAISE EXCEPTION 'Rollback refused: payment discounts exist'; END IF; END;$$;
DROP TRIGGER protect_payment_discount ON payments;
DROP FUNCTION protect_payment_discount();
ALTER TABLE payments DROP COLUMN payment_discount_type,DROP COLUMN payment_discount_value,DROP COLUMN payment_discount_amount,DROP COLUMN payment_discount_basis;
