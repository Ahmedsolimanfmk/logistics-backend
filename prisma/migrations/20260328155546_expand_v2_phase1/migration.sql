/*
  Warnings:

  - The values [INACTIVE] on the enum `vehicle_status` will be removed. If these variants are still used in the database, this will fail.
  - The `before` column on the `cash_expense_audits` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `after` column on the `cash_expense_audits` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `contact_email` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `contact_name` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `contact_phone` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `drivers` table. All the data in the column will be lost.
  - You are about to drop the column `event_type` on the `maintenance_work_order_events` table. All the data in the column will be lost.
  - You are about to drop the column `created_by_user` on the `trip_events` table. All the data in the column will be lost.
  - You are about to drop the column `event_type` on the `trip_events` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `vehicles` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[code]` on the table `clients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[employee_code]` on the table `drivers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[employee_code]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[chassis_no]` on the table `vehicles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[engine_no]` on the table `vehicles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code]` on the table `warehouses` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `action` to the `maintenance_work_order_events` table without a default value. This is not possible if the table is not empty.
  - Added the required column `action` to the `trip_events` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "part_tracking_mode" AS ENUM ('BULK', 'SERIALIZED', 'BOTH');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "posting_status" AS ENUM ('UNPOSTED', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "expense_module_source" AS ENUM ('TRIP', 'MAINTENANCE', 'INVENTORY', 'GENERAL');

-- CreateEnum
CREATE TYPE "vehicle_ownership_type" AS ENUM ('COMPANY_OWNED', 'LEASED', 'RENTED', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "maintenance_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "post_maintenance_report_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "trip_revenue_status" AS ENUM ('DRAFT', 'APPROVED', 'INVOICED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "vendor_reference_type" AS ENUM ('CASH_EXPENSE', 'INVENTORY_RECEIPT', 'WORK_ORDER', 'MANUAL');

-- CreateEnum
CREATE TYPE "work_order_installation_type" AS ENUM ('NEW', 'REPLACEMENT', 'REINSTALL');

-- AlterEnum
ALTER TYPE "driver_status" ADD VALUE 'TERMINATED';

-- AlterEnum
ALTER TYPE "inventory_issue_status" ADD VALUE 'APPROVED';

-- AlterEnum
ALTER TYPE "inventory_receipt_status" ADD VALUE 'APPROVED';

-- AlterEnum
BEGIN;
CREATE TYPE "vehicle_status_new" AS ENUM ('AVAILABLE', 'ON_TRIP', 'MAINTENANCE', 'DISABLED', 'RETIRED');
ALTER TABLE "public"."vehicles" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "vehicles" ALTER COLUMN "status" TYPE "vehicle_status_new" USING ("status"::text::"vehicle_status_new");
ALTER TYPE "vehicle_status" RENAME TO "vehicle_status_old";
ALTER TYPE "vehicle_status_new" RENAME TO "vehicle_status";
DROP TYPE "public"."vehicle_status_old";
ALTER TABLE "vehicles" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
COMMIT;

-- DropForeignKey
ALTER TABLE "trip_events" DROP CONSTRAINT "trip_events_created_by_user_fkey";

-- DropIndex
DROP INDEX "drivers_is_active_idx";

-- DropIndex
DROP INDEX "uq_receipt_manufacturer_serial";

-- DropIndex
DROP INDEX "idx_mwoe_event_type";

-- DropIndex
DROP INDEX "idx_trip_events_event_type";

-- AlterTable
ALTER TABLE "ar_invoices" ADD COLUMN     "currency" TEXT DEFAULT 'EGP',
ADD COLUMN     "exchange_rate" DECIMAL(12,6),
ADD COLUMN     "submitted_at" TIMESTAMPTZ(6),
ADD COLUMN     "submitted_by" UUID;

-- AlterTable
ALTER TABLE "ar_payments" ADD COLUMN     "currency" TEXT DEFAULT 'EGP',
ADD COLUMN     "exchange_rate" DECIMAL(12,6),
ADD COLUMN     "posted_at" TIMESTAMPTZ(6),
ADD COLUMN     "posted_by" UUID,
ADD COLUMN     "submitted_at" TIMESTAMPTZ(6),
ADD COLUMN     "submitted_by" UUID;

-- AlterTable
ALTER TABLE "cash_advances" ADD COLUMN     "currency" TEXT DEFAULT 'EGP',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "reference_no" TEXT;

-- AlterTable
ALTER TABLE "cash_expense_audits" ADD COLUMN     "from_status" TEXT,
ADD COLUMN     "to_status" TEXT,
DROP COLUMN "before",
ADD COLUMN     "before" JSONB,
DROP COLUMN "after",
ADD COLUMN     "after" JSONB;

-- AlterTable
ALTER TABLE "cash_expenses" ADD COLUMN     "currency" TEXT DEFAULT 'EGP',
ADD COLUMN     "exchange_rate" DECIMAL(12,6),
ADD COLUMN     "module_reference_no" TEXT,
ADD COLUMN     "module_source" "expense_module_source" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "posting_status" "posting_status" NOT NULL DEFAULT 'UNPOSTED';

-- AlterTable
ALTER TABLE "client_contracts" ADD COLUMN     "document_url" TEXT,
ADD COLUMN     "signed_at" TIMESTAMPTZ(6),
ADD COLUMN     "terminated_at" TIMESTAMPTZ(6),
ADD COLUMN     "termination_reason" TEXT;

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "contact_email",
DROP COLUMN "contact_name",
DROP COLUMN "contact_phone",
DROP COLUMN "email",
ADD COLUMN     "billing_email" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "primary_contact_email" TEXT,
ADD COLUMN     "primary_contact_name" TEXT,
ADD COLUMN     "primary_contact_phone" TEXT;

-- AlterTable
ALTER TABLE "drivers" DROP COLUMN "is_active",
ADD COLUMN     "address" TEXT,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "employee_code" TEXT;

-- AlterTable
ALTER TABLE "fleet_site_assignments" ADD COLUMN     "ended_reason" TEXT;

-- AlterTable
ALTER TABLE "fleet_vehicles" ADD COLUMN     "ended_reason" TEXT;

-- AlterTable
ALTER TABLE "inventory_issue_lines" ADD COLUMN     "request_line_id" UUID;

-- AlterTable
ALTER TABLE "inventory_issues" ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "reference_no" TEXT;

-- AlterTable
ALTER TABLE "inventory_receipt_items" ALTER COLUMN "manufacturer_serial" DROP NOT NULL;

-- AlterTable
ALTER TABLE "inventory_receipts" ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "currency" TEXT DEFAULT 'EGP',
ADD COLUMN     "exchange_rate" DECIMAL(12,6),
ADD COLUMN     "reference_no" TEXT;

-- AlterTable
ALTER TABLE "inventory_request_lines" ADD COLUMN     "issued_qty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reserved_qty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "inventory_request_reservations" ADD COLUMN     "released_at" TIMESTAMPTZ(6),
ADD COLUMN     "status" "reservation_status" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "inventory_requests" ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "rejected_at" TIMESTAMPTZ(6),
ADD COLUMN     "rejected_by" UUID,
ADD COLUMN     "rejection_reason" TEXT;

-- AlterTable
ALTER TABLE "maintenance_requests" ADD COLUMN     "category" TEXT,
ADD COLUMN     "closed_at" TIMESTAMPTZ(6),
ADD COLUMN     "priority" "maintenance_priority" NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "maintenance_work_order_events" DROP COLUMN "event_type",
ADD COLUMN     "action" TEXT NOT NULL,
ADD COLUMN     "from_status" TEXT,
ADD COLUMN     "to_status" TEXT;

-- AlterTable
ALTER TABLE "maintenance_work_orders" ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN     "cancelled_by" UUID,
ADD COLUMN     "closed_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "part_items" ADD COLUMN     "issued_at" TIMESTAMPTZ(6),
ADD COLUMN     "reserved_at" TIMESTAMPTZ(6),
ADD COLUMN     "scrap_reason" TEXT,
ADD COLUMN     "scrapped_at" TIMESTAMPTZ(6),
ALTER COLUMN "manufacturer_serial" DROP NOT NULL;

-- AlterTable
ALTER TABLE "parts" ADD COLUMN     "default_unit_cost" DECIMAL(12,2),
ADD COLUMN     "is_consumable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tracking_mode" "part_tracking_mode" NOT NULL DEFAULT 'BULK';

-- AlterTable
ALTER TABLE "post_maintenance_reports" ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "status" "post_maintenance_report_status" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "supervisor_assignments" ADD COLUMN     "ended_reason" TEXT;

-- AlterTable
ALTER TABLE "trip_assignments" ADD COLUMN     "ended_reason" TEXT,
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "trip_events" DROP COLUMN "created_by_user",
DROP COLUMN "event_type",
ADD COLUMN     "action" TEXT NOT NULL,
ADD COLUMN     "actor_id" UUID,
ADD COLUMN     "from_status" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "to_status" TEXT;

-- AlterTable
ALTER TABLE "trip_revenues" ADD COLUMN     "currency_rate" DECIMAL(12,6),
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "status" "trip_revenue_status" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN     "cancelled_by" UUID,
ADD COLUMN     "closed_notes" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "employee_code" TEXT,
ADD COLUMN     "last_login_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "is_active",
ADD COLUMN     "chassis_no" TEXT,
ADD COLUMN     "engine_no" TEXT,
ADD COLUMN     "ownership_type" "vehicle_ownership_type" NOT NULL DEFAULT 'COMPANY_OWNED';

-- AlterTable
ALTER TABLE "vendor_transactions" ADD COLUMN     "currency" TEXT DEFAULT 'EGP',
ADD COLUMN     "exchange_rate" DECIMAL(12,6),
ADD COLUMN     "posted_at" TIMESTAMPTZ(6),
ADD COLUMN     "reference_type" "vendor_reference_type" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "currency" TEXT DEFAULT 'EGP',
ADD COLUMN     "is_blacklisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "opening_balance_date" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "warehouse_parts" ADD COLUMN     "max_stock" INTEGER,
ADD COLUMN     "reorder_level" INTEGER;

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "code" TEXT,
ADD COLUMN     "manager_user_id" UUID;

-- AlterTable
ALTER TABLE "work_order_installations" ADD COLUMN     "installation_type" "work_order_installation_type" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "removed_part_item_id" UUID;

-- DropEnum
DROP TYPE "PaymentStatus";

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_employee_code_key" ON "drivers"("employee_code");

-- CreateIndex
CREATE INDEX "idx_mwoe_action" ON "maintenance_work_order_events"("action");

-- CreateIndex
CREATE INDEX "idx_trip_events_action" ON "trip_events"("action");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_chassis_no_key" ON "vehicles"("chassis_no");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_engine_no_key" ON "vehicles"("engine_no");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- AddForeignKey
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_order_events" ADD CONSTRAINT "maintenance_work_order_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_maintenance_reports" ADD CONSTRAINT "post_maintenance_reports_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_maintenance_reports" ADD CONSTRAINT "post_maintenance_reports_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "inventory_receipts_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_requests" ADD CONSTRAINT "inventory_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_requests" ADD CONSTRAINT "inventory_requests_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_reads" ADD CONSTRAINT "alert_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
