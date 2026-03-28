/*
  Warnings:

  - A unique constraint covering the columns `[company_id,internal_serial]` on the table `part_items` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,manufacturer_serial]` on the table `part_items` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "part_items_internal_serial_key";

-- DropIndex
DROP INDEX "part_items_manufacturer_serial_key";

-- AlterTable
ALTER TABLE "inventory_issue_lines" ADD COLUMN     "companiesId" UUID;

-- AlterTable
ALTER TABLE "inventory_issues" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "inventory_receipt_bulk_lines" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "inventory_receipt_items" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "inventory_receipts" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "inventory_request_lines" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "inventory_request_reservations" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "inventory_requests" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "part_items" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "warehouse_parts" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "work_order_installations" ADD COLUMN     "company_id" UUID;

-- CreateIndex
CREATE INDEX "idx_inventory_issues_company_id" ON "inventory_issues"("company_id");

-- CreateIndex
CREATE INDEX "idx_receipt_bulk_lines_company_id" ON "inventory_receipt_bulk_lines"("company_id");

-- CreateIndex
CREATE INDEX "idx_inventory_receipt_items_company_id" ON "inventory_receipt_items"("company_id");

-- CreateIndex
CREATE INDEX "idx_inventory_receipts_company_id" ON "inventory_receipts"("company_id");

-- CreateIndex
CREATE INDEX "idx_inventory_request_lines_company_id" ON "inventory_request_lines"("company_id");

-- CreateIndex
CREATE INDEX "idx_req_res_company_id" ON "inventory_request_reservations"("company_id");

-- CreateIndex
CREATE INDEX "idx_inventory_requests_company_id" ON "inventory_requests"("company_id");

-- CreateIndex
CREATE INDEX "idx_part_items_company_id" ON "part_items"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_part_items_company_internal_serial" ON "part_items"("company_id", "internal_serial");

-- CreateIndex
CREATE UNIQUE INDEX "uq_part_items_company_manufacturer_serial" ON "part_items"("company_id", "manufacturer_serial");

-- CreateIndex
CREATE INDEX "idx_warehouse_parts_company_id" ON "warehouse_parts"("company_id");

-- CreateIndex
CREATE INDEX "idx_woi_company_id" ON "work_order_installations"("company_id");

-- AddForeignKey
ALTER TABLE "part_items" ADD CONSTRAINT "part_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_parts" ADD CONSTRAINT "warehouse_parts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipt_bulk_lines" ADD CONSTRAINT "inventory_receipt_bulk_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_requests" ADD CONSTRAINT "inventory_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_request_lines" ADD CONSTRAINT "inventory_request_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_request_reservations" ADD CONSTRAINT "inventory_request_reservations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_issue_lines" ADD CONSTRAINT "inventory_issue_lines_companiesId_fkey" FOREIGN KEY ("companiesId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_installations" ADD CONSTRAINT "work_order_installations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
