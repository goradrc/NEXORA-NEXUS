-- AlterEnum
ALTER TYPE "POStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_RECEIVED';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "purchase_receipt_line_id" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "purchase_receipt_sequences" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next_number" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "purchase_receipt_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "purchase_receipts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "purchase_order_id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "purchase_receipt_lines" (
    "id" TEXT NOT NULL,
    "purchase_receipt_id" TEXT NOT NULL,
    "line_item_id" TEXT NOT NULL,
    "quantity_received" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "purchase_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "stock_movements_purchase_receipt_line_id_key" ON "stock_movements"("purchase_receipt_line_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_receipt_sequences_organization_id_year_key" ON "purchase_receipt_sequences"("organization_id", "year");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_receipts_organization_id_purchase_order_id_idx" ON "purchase_receipts"("organization_id", "purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_receipts_organization_id_idempotency_key_key" ON "purchase_receipts"("organization_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_receipts_organization_id_receipt_number_key" ON "purchase_receipts"("organization_id", "receipt_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_receipt_lines_purchase_receipt_id_idx" ON "purchase_receipt_lines"("purchase_receipt_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "purchase_receipt_lines_line_item_id_idx" ON "purchase_receipt_lines"("line_item_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_receipt_line_id_fkey" FOREIGN KEY ("purchase_receipt_line_id") REFERENCES "purchase_receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_sequences" ADD CONSTRAINT "purchase_receipt_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_purchase_receipt_id_fkey" FOREIGN KEY ("purchase_receipt_id") REFERENCES "purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_line_item_id_fkey" FOREIGN KEY ("line_item_id") REFERENCES "line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
