-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE';
