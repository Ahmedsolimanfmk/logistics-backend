/*
  Warnings:

  - You are about to drop the column `plate_number` on the `vehicles` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[fleet_no]` on the table `vehicles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[plate_no]` on the table `vehicles` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `fleet_no` to the `vehicles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `plate_no` to the `vehicles` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "idx_cash_advances_created_at";

-- DropIndex
DROP INDEX "idx_cash_advances_status";

-- DropIndex
DROP INDEX "idx_cash_advances_supervisor_status_created";

-- DropIndex
DROP INDEX "idx_cash_expenses_approval_status";

-- DropIndex
DROP INDEX "idx_cash_expenses_cash_advance_id";

-- DropIndex
DROP INDEX "idx_cash_expenses_created_at";

-- DropIndex
DROP INDEX "idx_cash_expenses_created_at_status";

-- DropIndex
DROP INDEX "idx_cash_expenses_trip_id";

-- DropIndex
DROP INDEX "idx_cash_expenses_vehicle_id";

-- DropIndex
DROP INDEX "idx_trip_assignments_assigned_at";

-- DropIndex
DROP INDEX "idx_trip_assignments_driver_id";

-- DropIndex
DROP INDEX "idx_trip_assignments_is_active";

-- DropIndex
DROP INDEX "idx_trip_assignments_supervisor_active";

-- DropIndex
DROP INDEX "idx_trip_assignments_trip_active";

-- DropIndex
DROP INDEX "idx_trip_assignments_trip_id";

-- DropIndex
DROP INDEX "idx_trip_assignments_vehicle_id";

-- DropIndex
DROP INDEX "idx_trips_client_site_created_at";

-- DropIndex
DROP INDEX "idx_trips_created_at";

-- DropIndex
DROP INDEX "idx_trips_created_at_status";

-- DropIndex
DROP INDEX "idx_trips_financial_closed_at";

-- DropIndex
DROP INDEX "idx_trips_status";

-- DropIndex
DROP INDEX "idx_vehicles_plate_number";

-- DropIndex
DROP INDEX "idx_vehicles_status";

-- DropIndex
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_plate_number_key";

-- AlterTable
ALTER TABLE "cash_expenses" ADD COLUMN     "expense_source" TEXT NOT NULL DEFAULT 'CASH',
ADD COLUMN     "maintenance_work_order_id" UUID;

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "plate_number",
ADD COLUMN     "current_odometer" INTEGER,
ADD COLUMN     "display_name" TEXT,
ADD COLUMN     "fleet_no" TEXT NOT NULL,
ADD COLUMN     "gps_device_id" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "plate_no" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'AVAILABLE',
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "maintenance_work_orders" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "vehicle_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "type" TEXT NOT NULL DEFAULT 'CORRECTIVE',
    "vendor_name" TEXT,
    "opened_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "odometer" INTEGER,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_work_order_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "work_order_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" UUID,
    "notes" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_work_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "part_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "unit" TEXT,
    "min_stock" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_issues" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "work_order_id" UUID NOT NULL,
    "issued_by" UUID,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_issue_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "issue_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "total_cost" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "inventory_issue_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_installations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "work_order_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "qty_installed" DECIMAL(12,3) NOT NULL,
    "installed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "odometer_at_install" INTEGER,
    "installed_by" TEXT,
    "warranty_until_date" TIMESTAMPTZ(6),
    "warranty_until_km" INTEGER,
    "notes" TEXT,

    CONSTRAINT "work_order_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_maintenance_reports" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "work_order_id" UUID NOT NULL,
    "checked_by" UUID,
    "checked_at" TIMESTAMPTZ(6),
    "road_test_result" TEXT,
    "checklist_json" JSONB,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_maintenance_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "vehicle_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "problem_title" TEXT NOT NULL,
    "problem_description" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_mwo_opened_at" ON "maintenance_work_orders"("opened_at");

-- CreateIndex
CREATE INDEX "idx_mwo_status" ON "maintenance_work_orders"("status");

-- CreateIndex
CREATE INDEX "idx_mwo_type" ON "maintenance_work_orders"("type");

-- CreateIndex
CREATE INDEX "idx_mwo_vehicle_id" ON "maintenance_work_orders"("vehicle_id");

-- CreateIndex
CREATE INDEX "idx_mwoe_event_type" ON "maintenance_work_order_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_mwoe_work_order_id" ON "maintenance_work_order_events"("work_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "parts_part_number_key" ON "parts"("part_number");

-- CreateIndex
CREATE INDEX "idx_parts_name" ON "parts"("name");

-- CreateIndex
CREATE INDEX "idx_inventory_issues_issued_at" ON "inventory_issues"("issued_at");

-- CreateIndex
CREATE INDEX "idx_inventory_issues_work_order_id" ON "inventory_issues"("work_order_id");

-- CreateIndex
CREATE INDEX "idx_inventory_issue_lines_issue_id" ON "inventory_issue_lines"("issue_id");

-- CreateIndex
CREATE INDEX "idx_inventory_issue_lines_part_id" ON "inventory_issue_lines"("part_id");

-- CreateIndex
CREATE INDEX "idx_woi_installed_at" ON "work_order_installations"("installed_at");

-- CreateIndex
CREATE INDEX "idx_woi_part_id" ON "work_order_installations"("part_id");

-- CreateIndex
CREATE INDEX "idx_woi_vehicle_id" ON "work_order_installations"("vehicle_id");

-- CreateIndex
CREATE INDEX "idx_woi_work_order_id" ON "work_order_installations"("work_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_maintenance_reports_work_order_id_key" ON "post_maintenance_reports"("work_order_id");

-- CreateIndex
CREATE INDEX "idx_pmr_checked_at" ON "post_maintenance_reports"("checked_at");

-- CreateIndex
CREATE INDEX "idx_mr_requested_at" ON "maintenance_requests"("requested_at");

-- CreateIndex
CREATE INDEX "idx_mr_status" ON "maintenance_requests"("status");

-- CreateIndex
CREATE INDEX "idx_mr_vehicle_id" ON "maintenance_requests"("vehicle_id");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_expense_source" ON "cash_expenses"("expense_source");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_maintenance_work_order_id" ON "cash_expenses"("maintenance_work_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_fleet_no_key" ON "vehicles"("fleet_no");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_no_key" ON "vehicles"("plate_no");

-- AddForeignKey
ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_maintenance_work_order_id_fkey" FOREIGN KEY ("maintenance_work_order_id") REFERENCES "maintenance_work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_order_events" ADD CONSTRAINT "maintenance_work_order_events_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "maintenance_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_issues" ADD CONSTRAINT "inventory_issues_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "maintenance_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_issue_lines" ADD CONSTRAINT "inventory_issue_lines_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "inventory_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_issue_lines" ADD CONSTRAINT "inventory_issue_lines_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_installations" ADD CONSTRAINT "work_order_installations_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_installations" ADD CONSTRAINT "work_order_installations_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_installations" ADD CONSTRAINT "work_order_installations_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "maintenance_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_maintenance_reports" ADD CONSTRAINT "post_maintenance_reports_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "maintenance_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
