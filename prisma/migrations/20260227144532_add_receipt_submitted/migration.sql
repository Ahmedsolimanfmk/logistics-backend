-- AlterEnum
ALTER TYPE "inventory_receipt_status" ADD VALUE 'SUBMITTED';

-- AlterTable
ALTER TABLE "inventory_receipts" ADD COLUMN     "submitted_at" TIMESTAMPTZ(6),
ADD COLUMN     "submitted_by" UUID;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
