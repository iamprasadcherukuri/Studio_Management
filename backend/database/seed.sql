-- OPTIONAL DEMO DATA. No users, credentials or financial transactions are seeded.
SET search_path TO studio,public;
INSERT INTO packages(name,amount,description) VALUES ('Essential',15000,'Event photography'),('Signature',45000,'Photography and film'),('Wedding story',90000,'Full wedding coverage') ON CONFLICT DO NOTHING;
