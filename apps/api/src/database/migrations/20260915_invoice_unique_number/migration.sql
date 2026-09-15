-- Additive migration: Add unique constraint on invoices(organization_id, invoice_number)
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_organization_id_invoice_number_key" ON "invoices"("organization_id", "invoice_number");
