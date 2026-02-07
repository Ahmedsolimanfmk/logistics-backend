-- CreateEnum
CREATE TYPE "cash_payment_source" AS ENUM ('ADVANCE', 'COMPANY');

-- DropForeignKey
ALTER TABLE "maintenance_work_orders" DROP CONSTRAINT "maintenance_work_orders_request_id_fkey";

-- DropIndex
DROP INDEX "trip_assignments_field_supervisor_id_trip_id_idx";

-- DropIndex
DROP INDEX "trip_assignments_trip_id_is_active_idx";

-- DropIndex
DROP INDEX "trips_financial_closed_at_idx";

-- DropIndex
DROP INDEX "trips_status_idx";

-- AlterTable
ALTER TABLE "cash_advances" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "cash_expenses" ADD COLUMN     "payment_source" "cash_payment_source" NOT NULL DEFAULT 'ADVANCE',
ALTER COLUMN "cash_advance_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "idx_cash_advances_supervisor_id" ON "cash_advances"("field_supervisor_id");

-- CreateIndex
CREATE INDEX "idx_cash_advances_status" ON "cash_advances"("status");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_payment_source" ON "cash_expenses"("payment_source");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_cash_advance_id" ON "cash_expenses"("cash_advance_id");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_trip_id" ON "cash_expenses"("trip_id");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_vehicle_id" ON "cash_expenses"("vehicle_id");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_approval_status" ON "cash_expenses"("approval_status");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_created_by" ON "cash_expenses"("created_by");

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "maintenance_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
