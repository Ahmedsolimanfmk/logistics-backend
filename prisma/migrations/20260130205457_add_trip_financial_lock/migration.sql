/*
  Warnings:

  - You are about to drop the column `issue_date` on the `cash_advances` table. All the data in the column will be lost.
  - You are about to drop the column `appeal_notes` on the `cash_expenses` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `clients` table. All the data in the column will be lost.
  - You are about to drop the column `lat` on the `sites` table. All the data in the column will be lost.
  - You are about to drop the column `lng` on the `sites` table. All the data in the column will be lost.
  - You are about to drop the column `created_by_driver` on the `trip_events` table. All the data in the column will be lost.
  - You are about to drop the column `lat` on the `trip_events` table. All the data in the column will be lost.
  - You are about to drop the column `lng` on the `trip_events` table. All the data in the column will be lost.
  - You are about to drop the column `assigned_at` on the `vehicle_portfolio` table. All the data in the column will be lost.
  - You are about to drop the column `current_odometer` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `deleted_at` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `display_name` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `gps_device_id` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `is_active` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `plate_no` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the `gps_points` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `licenses` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `actor_id` on table `cash_expense_audits` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "cash_expense_audits" DROP CONSTRAINT "cash_expense_audits_expense_id_fkey";

-- DropForeignKey
ALTER TABLE "cash_expenses" DROP CONSTRAINT "cash_expenses_cash_advance_id_fkey";

-- DropForeignKey
ALTER TABLE "gps_points" DROP CONSTRAINT "gps_points_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "licenses" DROP CONSTRAINT "licenses_driver_id_fkey";

-- DropForeignKey
ALTER TABLE "licenses" DROP CONSTRAINT "licenses_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_assignments" DROP CONSTRAINT "trip_assignments_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_events" DROP CONSTRAINT "trip_events_created_by_driver_fkey";

-- DropForeignKey
ALTER TABLE "trip_events" DROP CONSTRAINT "trip_events_trip_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_portfolio" DROP CONSTRAINT "vehicle_portfolio_vehicle_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "cash_expense_audits_actor_id_created_at_idx";
-- DropIndex
DROP INDEX IF EXISTS "cash_expense_audits_expense_id_created_at_idx";
-- DropIndex
DROP INDEX IF EXISTS "drivers_phone_key";
-- DropIndex
DROP INDEX IF EXISTS "trip_assignments_trip_id_is_active_key";
-- DropIndex
DROP INDEX IF EXISTS "vehicle_portfolio_vehicle_id_is_active_key";
-- DropIndex
DROP INDEX IF EXISTS "vehicles_plate_no_key";
-- AlterTable
ALTER TABLE "cash_advances" DROP COLUMN "issue_date",
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "cash_expense_audits" ALTER COLUMN "actor_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "cash_expenses" DROP COLUMN "appeal_notes",
ADD COLUMN     "appeal_reason" TEXT,
ADD COLUMN     "appeal_status" TEXT,
ADD COLUMN     "resolution_notes" TEXT,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "clients" DROP COLUMN "phone",
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "license_no" TEXT,
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "sites" DROP COLUMN "lat",
DROP COLUMN "lng",
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "trip_assignments" ADD COLUMN     "unassigned_at" TIMESTAMPTZ(6),
ALTER COLUMN "field_supervisor_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "trip_events" DROP COLUMN "created_by_driver",
DROP COLUMN "lat",
DROP COLUMN "lng";

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "financial_closed_at" TIMESTAMPTZ(6),
ADD COLUMN     "financial_closed_by" UUID,
ADD COLUMN     "financial_review_opened_at" TIMESTAMPTZ(6),
ADD COLUMN     "financial_status" TEXT NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "vehicle_portfolio" DROP COLUMN "assigned_at",
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "current_odometer",
DROP COLUMN "deleted_at",
DROP COLUMN "display_name",
DROP COLUMN "gps_device_id",
DROP COLUMN "is_active",
DROP COLUMN "plate_no",
ADD COLUMN     "model" TEXT,
ADD COLUMN     "year" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'ACTIVE',
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "gps_points";

-- DropTable
DROP TABLE "licenses";

-- AddForeignKey
ALTER TABLE "cash_expense_audits" ADD CONSTRAINT "cash_expense_audits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "cash_expenses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_cash_advance_id_fkey" FOREIGN KEY ("cash_advance_id") REFERENCES "cash_advances"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_financial_closed_by_fkey" FOREIGN KEY ("financial_closed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vehicle_portfolio" ADD CONSTRAINT "vehicle_portfolio_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
