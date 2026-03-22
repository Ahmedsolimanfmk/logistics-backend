/*
  Warnings:

  - You are about to drop the column `source_trip_id` on the `ar_invoices` table. All the data in the column will be lost.
  - The `status` column on the `cash_advances` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `vendor_name` on the `cash_expenses` table. All the data in the column will be lost.
  - The `approval_status` column on the `cash_expenses` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `supplier_name` on the `inventory_receipts` table. All the data in the column will be lost.
  - The `status` column on the `maintenance_requests` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `vendor_name` on the `maintenance_work_orders` table. All the data in the column will be lost.
  - The `status` column on the `maintenance_work_orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `type` column on the `maintenance_work_orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `trips` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `financial_status` column on the `trips` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `vehicles` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[contract_no]` on the table `client_contracts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[vehicle_id,field_supervisor_id]` on the table `vehicle_portfolio` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'PARTIAL');

-- CreateEnum
CREATE TYPE "vehicle_status" AS ENUM ('AVAILABLE', 'ON_TRIP', 'MAINTENANCE', 'INACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('INTERNAL', 'EXTERNAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "maintenance_request_status" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "maintenance_work_order_status" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "maintenance_work_order_type" AS ENUM ('CORRECTIVE', 'PREVENTIVE', 'EMERGENCY', 'INSPECTION');

-- CreateEnum
CREATE TYPE "trip_status" AS ENUM ('DRAFT', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "trip_financial_status" AS ENUM ('OPEN', 'UNDER_REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "trip_revenue_source" AS ENUM ('MANUAL', 'CONTRACT', 'INVOICE');

-- CreateEnum
CREATE TYPE "revenue_entry_mode" AS ENUM ('MANUAL', 'CONTRACT');

-- CreateEnum
CREATE TYPE "cash_expense_approval_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPEALED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "cash_advance_status" AS ENUM ('OPEN', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "vendor_type" AS ENUM ('MAINTENANCE_CENTER', 'PARTS_SUPPLIER', 'TIRE_SHOP', 'FUEL_SUPPLIER', 'ROADSIDE_ASSISTANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "vendor_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "vendor_classification" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "vendor_transaction_type" AS ENUM ('INVOICE', 'PAYMENT', 'ADJUSTMENT', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- DropForeignKey
ALTER TABLE "cash_expense_audits" DROP CONSTRAINT "cash_expense_audits_expense_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_requests" DROP CONSTRAINT "inventory_requests_warehouse_id_fkey";

-- DropIndex
DROP INDEX "idx_cash_expenses_vendor_name";

-- AlterTable
ALTER TABLE "ar_invoices" DROP COLUMN "source_trip_id";

-- AlterTable
ALTER TABLE "cash_advances" DROP COLUMN "status",
ADD COLUMN     "status" "cash_advance_status" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "cash_expenses" DROP COLUMN "vendor_name",
ADD COLUMN     "vendor_id" UUID,
DROP COLUMN "approval_status",
ADD COLUMN     "approval_status" "cash_expense_approval_status" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "inventory_receipts" DROP COLUMN "supplier_name",
ADD COLUMN     "vendor_id" UUID;

-- AlterTable
ALTER TABLE "maintenance_requests" DROP COLUMN "status",
ADD COLUMN     "status" "maintenance_request_status" NOT NULL DEFAULT 'SUBMITTED';

-- AlterTable
ALTER TABLE "maintenance_work_orders" DROP COLUMN "vendor_name",
ADD COLUMN     "maintenance_mode" "MaintenanceType" NOT NULL DEFAULT 'INTERNAL',
ADD COLUMN     "vendor_id" UUID,
DROP COLUMN "status",
ADD COLUMN     "status" "maintenance_work_order_status" NOT NULL DEFAULT 'DRAFT',
DROP COLUMN "type",
ADD COLUMN     "type" "maintenance_work_order_type" NOT NULL DEFAULT 'CORRECTIVE';

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "actual_arrival_at" TIMESTAMPTZ(6),
ADD COLUMN     "actual_departure_at" TIMESTAMPTZ(6),
ADD COLUMN     "agreed_revenue" DECIMAL(12,2),
ADD COLUMN     "cargo_type" TEXT,
ADD COLUMN     "cargo_weight" DECIMAL(12,3),
ADD COLUMN     "destination" TEXT,
ADD COLUMN     "origin" TEXT,
ADD COLUMN     "revenue_currency" TEXT DEFAULT 'EGP',
ADD COLUMN     "revenue_entry_mode" "revenue_entry_mode",
DROP COLUMN "status",
ADD COLUMN     "status" "trip_status" NOT NULL DEFAULT 'DRAFT',
DROP COLUMN "financial_status",
ADD COLUMN     "financial_status" "trip_financial_status" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "status",
ADD COLUMN     "status" "vehicle_status" NOT NULL DEFAULT 'AVAILABLE';

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "code" TEXT,
    "vendor_type" "vendor_type" NOT NULL,
    "classification" "vendor_classification" NOT NULL DEFAULT 'EXTERNAL',
    "status" "vendor_status" NOT NULL DEFAULT 'ACTIVE',
    "specialization" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "phone2" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "tax_no" TEXT,
    "commercial_register" TEXT,
    "payment_terms" TEXT,
    "opening_balance" DECIMAL(12,2),
    "credit_limit" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_transactions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "vendor_id" UUID NOT NULL,
    "transaction_type" "vendor_transaction_type" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transaction_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference_no" TEXT,
    "notes" TEXT,
    "related_cash_expense_id" UUID,
    "related_work_order_id" UUID,
    "related_inventory_receipt_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_invoice_trip_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "invoice_id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ar_invoice_trip_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_revenues" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "trip_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "contract_id" UUID,
    "invoice_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT DEFAULT 'EGP',
    "source" "trip_revenue_source" NOT NULL DEFAULT 'MANUAL',
    "entered_by" UUID,
    "approved_by" UUID,
    "entered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMPTZ(6),
    "notes" TEXT,

    CONSTRAINT "trip_revenues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendors_code_key" ON "vendors"("code");

-- CreateIndex
CREATE INDEX "idx_vendors_name" ON "vendors"("name");

-- CreateIndex
CREATE INDEX "idx_vendors_vendor_type" ON "vendors"("vendor_type");

-- CreateIndex
CREATE INDEX "idx_vendors_status" ON "vendors"("status");

-- CreateIndex
CREATE INDEX "idx_vendor_transactions_vendor_id" ON "vendor_transactions"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_vendor_transactions_date" ON "vendor_transactions"("transaction_date");

-- CreateIndex
CREATE INDEX "idx_ar_invoice_trip_invoice_id" ON "ar_invoice_trip_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "idx_ar_invoice_trip_trip_id" ON "ar_invoice_trip_lines"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_ar_invoice_trip" ON "ar_invoice_trip_lines"("invoice_id", "trip_id");

-- CreateIndex
CREATE INDEX "idx_trip_revenues_trip_id" ON "trip_revenues"("trip_id");

-- CreateIndex
CREATE INDEX "idx_trip_revenues_client_id" ON "trip_revenues"("client_id");

-- CreateIndex
CREATE INDEX "idx_trip_revenues_invoice_id" ON "trip_revenues"("invoice_id");

-- CreateIndex
CREATE INDEX "idx_cash_advances_status" ON "cash_advances"("status");

-- CreateIndex
CREATE INDEX "idx_cash_expense_audits_expense_id" ON "cash_expense_audits"("expense_id");

-- CreateIndex
CREATE INDEX "idx_cash_expense_audits_actor_id" ON "cash_expense_audits"("actor_id");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_vendor_id" ON "cash_expenses"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_contracts_contract_no_key" ON "client_contracts"("contract_no");

-- CreateIndex
CREATE INDEX "idx_inventory_receipts_vendor_id" ON "inventory_receipts"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_mr_status" ON "maintenance_requests"("status");

-- CreateIndex
CREATE INDEX "idx_mwo_status" ON "maintenance_work_orders"("status");

-- CreateIndex
CREATE INDEX "idx_mwo_type" ON "maintenance_work_orders"("type");

-- CreateIndex
CREATE INDEX "idx_mwo_vendor_id" ON "maintenance_work_orders"("vendor_id");

-- CreateIndex
CREATE INDEX "idx_sites_client_id" ON "sites"("client_id");

-- CreateIndex
CREATE INDEX "idx_trip_assignments_trip_id" ON "trip_assignments"("trip_id");

-- CreateIndex
CREATE INDEX "idx_trip_assignments_vehicle_id" ON "trip_assignments"("vehicle_id");

-- CreateIndex
CREATE INDEX "idx_trip_assignments_driver_id" ON "trip_assignments"("driver_id");

-- CreateIndex
CREATE INDEX "idx_trip_events_trip_id" ON "trip_events"("trip_id");

-- CreateIndex
CREATE INDEX "idx_trip_events_event_type" ON "trip_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_trips_status" ON "trips"("status");

-- CreateIndex
CREATE INDEX "idx_trips_financial_status" ON "trips"("financial_status");

-- CreateIndex
CREATE INDEX "idx_trips_client_id" ON "trips"("client_id");

-- CreateIndex
CREATE INDEX "idx_trips_site_id" ON "trips"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_vehicle_portfolio_vehicle_supervisor" ON "vehicle_portfolio"("vehicle_id", "field_supervisor_id");

-- CreateIndex
CREATE INDEX "idx_vehicles_status" ON "vehicles"("status");

-- AddForeignKey
ALTER TABLE "vendor_transactions" ADD CONSTRAINT "vendor_transactions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_transactions" ADD CONSTRAINT "vendor_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoice_trip_lines" ADD CONSTRAINT "ar_invoice_trip_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ar_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoice_trip_lines" ADD CONSTRAINT "ar_invoice_trip_lines_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "client_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ar_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_expense_audits" ADD CONSTRAINT "cash_expense_audits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "cash_expenses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_requests" ADD CONSTRAINT "inventory_requests_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "maintenance_request_attachments_request_id_idx" RENAME TO "idx_maintenance_request_attachments_request_id";
