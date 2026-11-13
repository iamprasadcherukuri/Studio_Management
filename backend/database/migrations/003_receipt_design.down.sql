-- Runner refuses this rollback after receipts, branding assets or new numbered payments exist.
DROP TRIGGER protect_receipt_snapshot ON payments;
DROP FUNCTION protect_receipt_snapshot();
ALTER TABLE studio_settings DROP COLUMN logo_asset_id,DROP COLUMN tagline,DROP COLUMN signatory_name,DROP COLUMN signatory_title,DROP COLUMN receipt_footer;
DROP TABLE studio_brand_assets;
DROP TRIGGER assign_receipt_number ON payments;
DROP FUNCTION assign_receipt_number();
DROP TABLE receipt_counters;
ALTER TABLE payments DROP CONSTRAINT payments_receipt_metadata,DROP COLUMN receipt_snapshot,DROP COLUMN receipt_basis,DROP COLUMN receipt_number,DROP COLUMN payment_type;
ALTER TABLE payments DROP CONSTRAINT payments_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_method_check CHECK(method IN ('Cash','UPI','Bank transfer','Cheque'));
ALTER TABLE bookings DROP CONSTRAINT bookings_receipt_discount_consistency,DROP COLUMN total_amount,DROP COLUMN discount_type,DROP COLUMN discount_value,DROP COLUMN discount_amount;
