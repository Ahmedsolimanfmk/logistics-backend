/*
  Warnings:

  - Made the column `company_id` on table `trip_assignments` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `trip_events` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `trip_revenues` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `trips` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "maintenance_request_attachments" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "maintenance_requests" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "maintenance_work_order_events" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "maintenance_work_orders" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "post_maintenance_reports" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "trip_assignments" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "trip_events" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "trip_revenues" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "trips" ALTER COLUMN "company_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "idx_maintenance_request_attachments_company_id" ON "maintenance_request_attachments"("company_id");

-- CreateIndex
CREATE INDEX "idx_mr_company_id" ON "maintenance_requests"("company_id");

-- CreateIndex
CREATE INDEX "idx_mwoe_company_id" ON "maintenance_work_order_events"("company_id");

-- CreateIndex
CREATE INDEX "idx_mwo_company_id" ON "maintenance_work_orders"("company_id");

-- CreateIndex
CREATE INDEX "idx_pmr_company_id" ON "post_maintenance_reports"("company_id");

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_request_attachments" ADD CONSTRAINT "maintenance_request_attachments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_order_events" ADD CONSTRAINT "maintenance_work_order_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_maintenance_reports" ADD CONSTRAINT "post_maintenance_reports_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
