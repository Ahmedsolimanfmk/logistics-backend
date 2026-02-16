/*
  Warnings:

  - You are about to alter the column `qty` on the `inventory_issue_lines` table. The data in that column could be lost. The data in that column will be cast from `Decimal(12,3)` to `Integer`.

*/
-- CreateEnum
CREATE TYPE "part_item_status" AS ENUM ('IN_STOCK', 'RESERVED', 'ISSUED', 'INSTALLED', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "inventory_receipt_status" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "inventory_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "inventory_issue_status" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "inventory_issue_lines" DROP CONSTRAINT "inventory_issue_lines_part_id_fkey";

-- AlterTable
ALTER TABLE "cash_expenses" ADD COLUMN     "inventory_receipt_id" UUID;

-- AlterTable
ALTER TABLE "inventory_issue_lines" ADD COLUMN     "part_item_id" UUID,
ALTER COLUMN "qty" SET DEFAULT 1,
ALTER COLUMN "qty" SET DATA TYPE INTEGER,
ALTER COLUMN "unit_cost" DROP NOT NULL,
ALTER COLUMN "total_cost" DROP NOT NULL;

-- AlterTable
ALTER TABLE "inventory_issues" ADD COLUMN     "posted_at" TIMESTAMPTZ(6),
ADD COLUMN     "request_id" UUID,
ADD COLUMN     "status" "inventory_issue_status" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "warehouse_id" UUID;

-- AlterTable
ALTER TABLE "parts" ADD COLUMN     "category" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "work_order_installations" ADD COLUMN     "part_item_id" UUID;

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "location" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "part_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "internal_serial" TEXT NOT NULL,
    "manufacturer_serial" TEXT NOT NULL,
    "status" "part_item_status" NOT NULL DEFAULT 'IN_STOCK',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_moved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_receipt_id" UUID,
    "installed_vehicle_id" UUID,
    "installed_at" TIMESTAMPTZ(6),

    CONSTRAINT "part_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_receipts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "warehouse_id" UUID NOT NULL,
    "supplier_name" TEXT NOT NULL,
    "invoice_no" TEXT,
    "invoice_date" TIMESTAMPTZ(6),
    "total_amount" DECIMAL(12,2),
    "status" "inventory_receipt_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_at" TIMESTAMPTZ(6),

    CONSTRAINT "inventory_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_receipt_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "receipt_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "internal_serial" TEXT NOT NULL,
    "manufacturer_serial" TEXT NOT NULL,
    "unit_cost" DECIMAL(12,2),
    "notes" TEXT,

    CONSTRAINT "inventory_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "warehouse_id" UUID NOT NULL,
    "work_order_id" UUID,
    "requested_by" UUID,
    "status" "inventory_request_status" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_request_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "request_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "needed_qty" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "inventory_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_name_key" ON "warehouses"("name");

-- CreateIndex
CREATE UNIQUE INDEX "part_items_internal_serial_key" ON "part_items"("internal_serial");

-- CreateIndex
CREATE UNIQUE INDEX "part_items_manufacturer_serial_key" ON "part_items"("manufacturer_serial");

-- CreateIndex
CREATE INDEX "idx_part_items_warehouse_id" ON "part_items"("warehouse_id");

-- CreateIndex
CREATE INDEX "idx_part_items_part_id" ON "part_items"("part_id");

-- CreateIndex
CREATE INDEX "idx_part_items_status" ON "part_items"("status");

-- CreateIndex
CREATE INDEX "idx_inventory_receipts_warehouse_id" ON "inventory_receipts"("warehouse_id");

-- CreateIndex
CREATE INDEX "idx_inventory_receipts_status" ON "inventory_receipts"("status");

-- CreateIndex
CREATE INDEX "idx_inventory_receipts_invoice_no" ON "inventory_receipts"("invoice_no");

-- CreateIndex
CREATE INDEX "idx_inventory_receipts_invoice_date" ON "inventory_receipts"("invoice_date");

-- CreateIndex
CREATE INDEX "idx_inventory_receipt_items_receipt_id" ON "inventory_receipt_items"("receipt_id");

-- CreateIndex
CREATE INDEX "idx_inventory_receipt_items_part_id" ON "inventory_receipt_items"("part_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_receipt_internal_serial" ON "inventory_receipt_items"("receipt_id", "internal_serial");

-- CreateIndex
CREATE UNIQUE INDEX "uq_receipt_manufacturer_serial" ON "inventory_receipt_items"("receipt_id", "manufacturer_serial");

-- CreateIndex
CREATE INDEX "idx_inventory_requests_warehouse_id" ON "inventory_requests"("warehouse_id");

-- CreateIndex
CREATE INDEX "idx_inventory_requests_status" ON "inventory_requests"("status");

-- CreateIndex
CREATE INDEX "idx_inventory_requests_work_order_id" ON "inventory_requests"("work_order_id");

-- CreateIndex
CREATE INDEX "idx_inventory_request_lines_request_id" ON "inventory_request_lines"("request_id");

-- CreateIndex
CREATE INDEX "idx_inventory_request_lines_part_id" ON "inventory_request_lines"("part_id");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_inventory_receipt_id" ON "cash_expenses"("inventory_receipt_id");

-- CreateIndex
CREATE INDEX "idx_inventory_issue_lines_part_item_id" ON "inventory_issue_lines"("part_item_id");

-- CreateIndex
CREATE INDEX "idx_inventory_issues_warehouse_id" ON "inventory_issues"("warehouse_id");

-- CreateIndex
CREATE INDEX "idx_inventory_issues_request_id" ON "inventory_issues"("request_id");

-- CreateIndex
CREATE INDEX "idx_inventory_issues_status" ON "inventory_issues"("status");

-- CreateIndex
CREATE INDEX "idx_woi_part_item_id" ON "work_order_installations"("part_item_id");

-- AddForeignKey
ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_inventory_receipt_id_fkey" FOREIGN KEY ("inventory_receipt_id") REFERENCES "inventory_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_items" ADD CONSTRAINT "part_items_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "part_items" ADD CONSTRAINT "part_items_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "part_items" ADD CONSTRAINT "part_items_received_receipt_id_fkey" FOREIGN KEY ("received_receipt_id") REFERENCES "inventory_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_items" ADD CONSTRAINT "part_items_installed_vehicle_id_fkey" FOREIGN KEY ("installed_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_requests" ADD CONSTRAINT "inventory_requests_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_requests" ADD CONSTRAINT "inventory_requests_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "maintenance_work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_requests" ADD CONSTRAINT "inventory_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_issue_lines" ADD CONSTRAINT "inventory_issue_lines_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_issue_lines" ADD CONSTRAINT "inventory_issue_lines_part_item_id_fkey" FOREIGN KEY ("part_item_id") REFERENCES "part_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_request_lines" ADD CONSTRAINT "inventory_request_lines_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "inventory_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_request_lines" ADD CONSTRAINT "inventory_request_lines_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "inventory_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_installations" ADD CONSTRAINT "work_order_installations_part_item_id_fkey" FOREIGN KEY ("part_item_id") REFERENCES "part_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
