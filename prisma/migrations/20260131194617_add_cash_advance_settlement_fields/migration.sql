-- AlterTable
ALTER TABLE "cash_advances" ADD COLUMN     "settled_at" TIMESTAMPTZ(6),
ADD COLUMN     "settled_by" UUID,
ADD COLUMN     "settlement_amount" DECIMAL(12,2),
ADD COLUMN     "settlement_notes" TEXT,
ADD COLUMN     "settlement_reference" TEXT,
ADD COLUMN     "settlement_type" TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT;
