-- Runner refuses rollback once any feature data exists. No CASCADE, no existing table removal.
DROP TRIGGER protect_maintenance_expense ON expenses;
DROP FUNCTION protect_maintenance_expense();
DROP TRIGGER protect_invoiced_booking ON bookings;
DROP FUNCTION protect_invoiced_booking();
DROP TABLE equipment_maintenance;
DROP TABLE equipment_assignments;
DROP TABLE equipment;
DROP TABLE invoice_items;
DROP TABLE invoices;
