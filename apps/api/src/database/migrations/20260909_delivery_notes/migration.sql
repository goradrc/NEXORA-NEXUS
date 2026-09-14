-- AlterTable
BEGIN;
ALTER TABLE "delivery_notes" ADD COLUMN     "quote_id" TEXT;

-- CreateTable
CREATE TABLE "sales_operations" (
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_operations_pkey" PRIMARY KEY ("organization_id","user_id","key")
);

-- CreateTable
CREATE TABLE "sales_stock_allocations" (
    "organization_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "sales_stock_allocations_pkey" PRIMARY KEY ("organization_id","scope","product_id")
);

-- CreateTable
CREATE TABLE "delivery_sequences" (
    "organization_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "delivery_sequences_pkey" PRIMARY KEY ("organization_id","year")
);

-- CreateIndex
CREATE INDEX "delivery_notes_organization_id_created_at_id_idx" ON "delivery_notes"("organization_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_notes_organization_id_delivery_number_key" ON "delivery_notes"("organization_id", "delivery_number");

-- AddForeignKey
ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Initialize numbering from existing BL identifiers; never reuse an existing sequence.
INSERT INTO "delivery_sequences" ("organization_id", "year", "value")
SELECT "organization_id", split_part("delivery_number", '-', 2)::integer,
       max(split_part("delivery_number", '-', 3)::integer)
FROM "delivery_notes" WHERE "delivery_number" ~ '^BL-[0-9]{4}-[0-9]{1,9}$'
GROUP BY "organization_id", split_part("delivery_number", '-', 2)::integer;

ALTER TABLE "products_services" ADD CONSTRAINT "stock_nonnegative_finite"
  CHECK ("current_stock" >= 0 AND "current_stock" < 'Infinity'::float8);
ALTER TABLE "sales_stock_allocations" ADD CONSTRAINT "allocation_positive_finite"
  CHECK ("quantity" > 0 AND "quantity" < 'Infinity'::float8);

-- Register permissions without granting them to any role automatically.
INSERT INTO "permissions" ("id", "code", "description") VALUES
  ('delivery-read-20260909', 'nexus:delivery-notes:read', 'Read delivery notes'),
  ('delivery-create-20260909', 'nexus:delivery-notes:create', 'Create delivery notes'),
  ('delivery-update-20260909', 'nexus:delivery-notes:update', 'Update draft delivery notes'),
  ('delivery-manage-20260909', 'nexus:delivery-notes:manage', 'Ship, deliver and cancel delivery notes'),
  ('invoice-manage-20260909', 'nexus:invoices:manage', 'Issue invoices')
ON CONFLICT ("code") DO NOTHING;
COMMIT;
