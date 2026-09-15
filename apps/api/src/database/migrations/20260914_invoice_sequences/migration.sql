-- Additive migration: Create invoice_sequences table
CREATE TABLE IF NOT EXISTS "invoice_sequences" (
    "organization_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("organization_id","year")
);
