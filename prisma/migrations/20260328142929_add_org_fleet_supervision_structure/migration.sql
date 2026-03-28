/*
  Warnings:

  - The `settlement_type` column on the `cash_advances` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `appeal_status` column on the `cash_expenses` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `paid_method` column on the `cash_expenses` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `city` on the `sites` table. All the data in the column will be lost.
  - You are about to drop the column `latitude` on the `sites` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `sites` table. All the data in the column will be lost.
  - You are about to drop the column `site_type` on the `sites` table. All the data in the column will be lost.
  - You are about to drop the column `zone` on the `sites` table. All the data in the column will be lost.
  - You are about to drop the column `zone_id` on the `sites` table. All the data in the column will be lost.
  - You are about to drop the column `approval_notes` on the `trip_revenues` table. All the data in the column will be lost.
  - You are about to drop the column `is_approved` on the `trip_revenues` table. All the data in the column will be lost.
  - You are about to drop the column `is_current` on the `trip_revenues` table. All the data in the column will be lost.
  - You are about to drop the column `pricing_rule_id` on the `trip_revenues` table. All the data in the column will be lost.
  - You are about to drop the column `pricing_rule_snapshot` on the `trip_revenues` table. All the data in the column will be lost.
  - You are about to drop the column `replaced_at` on the `trip_revenues` table. All the data in the column will be lost.
  - You are about to drop the column `replaced_by` on the `trip_revenues` table. All the data in the column will be lost.
  - You are about to drop the column `version_no` on the `trip_revenues` table. All the data in the column will be lost.
  - You are about to drop the column `cargo_type_id` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `dropoff_site_id` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `pickup_site_id` on the `trips` table. All the data in the column will be lost.
  - You are about to drop the column `route_id` on the `trips` table. All the data in the column will be lost.
  - The `trip_type` column on the `trips` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `vehicle_class_id` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `vendor_transactions` table. All the data in the column will be lost.
  - You are about to drop the column `posted_at` on the `vendor_transactions` table. All the data in the column will be lost.
  - You are about to drop the `cargo_types` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `contract_pricing_rules` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `routes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `vehicle_classes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `zones` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[manufacturer_serial]` on the table `part_items` will be added. If there are existing duplicate values, this will fail.
  - Made the column `manufacturer_serial` on table `part_items` required. This step will fail if there are existing NULL values in that column.
  - Made the column `site_id` on table `trips` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "contract_pricing_rules" DROP CONSTRAINT "contract_pricing_rules_cargo_type_id_fkey";

-- DropForeignKey
ALTER TABLE "contract_pricing_rules" DROP CONSTRAINT "contract_pricing_rules_client_id_fkey";

-- DropForeignKey
ALTER TABLE "contract_pricing_rules" DROP CONSTRAINT "contract_pricing_rules_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "contract_pricing_rules" DROP CONSTRAINT "contract_pricing_rules_dropoff_site_id_fkey";

-- DropForeignKey
ALTER TABLE "contract_pricing_rules" DROP CONSTRAINT "contract_pricing_rules_from_zone_id_fkey";

-- DropForeignKey
ALTER TABLE "contract_pricing_rules" DROP CONSTRAINT "contract_pricing_rules_pickup_site_id_fkey";

-- DropForeignKey
ALTER TABLE "contract_pricing_rules" DROP CONSTRAINT "contract_pricing_rules_route_id_fkey";

-- DropForeignKey
ALTER TABLE "contract_pricing_rules" DROP CONSTRAINT "contract_pricing_rules_to_zone_id_fkey";

-- DropForeignKey
ALTER TABLE "contract_pricing_rules" DROP CONSTRAINT "contract_pricing_rules_vehicle_class_id_fkey";

-- DropForeignKey
ALTER TABLE "maintenance_work_orders" DROP CONSTRAINT "maintenance_work_orders_created_by_fkey";

-- DropForeignKey
ALTER TABLE "routes" DROP CONSTRAINT "routes_client_id_fkey";

-- DropForeignKey
ALTER TABLE "routes" DROP CONSTRAINT "routes_dropoff_site_id_fkey";

-- DropForeignKey
ALTER TABLE "routes" DROP CONSTRAINT "routes_pickup_site_id_fkey";

-- DropForeignKey
ALTER TABLE "sites" DROP CONSTRAINT "sites_zone_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_revenues" DROP CONSTRAINT "trip_revenues_pricing_rule_id_fkey";

-- DropForeignKey
ALTER TABLE "trip_revenues" DROP CONSTRAINT "trip_revenues_replaced_by_fkey";

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_cargo_type_id_fkey";

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_dropoff_site_id_fkey";

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_pickup_site_id_fkey";

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_route_id_fkey";

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_site_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_vehicle_class_id_fkey";

-- DropIndex
DROP INDEX "idx_mwo_created_by";

-- DropIndex
DROP INDEX "idx_sites_zone_id";

-- DropIndex
DROP INDEX "idx_trip_revenues_pricing_rule_id";

-- DropIndex
DROP INDEX "idx_trip_revenues_trip_current";

-- DropIndex
DROP INDEX "idx_trip_revenues_trip_version";

-- DropIndex
DROP INDEX "idx_trips_cargo_type_id";

-- DropIndex
DROP INDEX "idx_trips_dropoff_site_id";

-- DropIndex
DROP INDEX "idx_trips_pickup_site_id";

-- DropIndex
DROP INDEX "idx_trips_route_id";

-- DropIndex
DROP INDEX "idx_vehicles_vehicle_class_id";

-- AlterTable
ALTER TABLE "cash_advances" DROP COLUMN "settlement_type",
ADD COLUMN     "settlement_type" TEXT;

-- AlterTable
ALTER TABLE "cash_expenses" DROP COLUMN "appeal_status",
ADD COLUMN     "appeal_status" TEXT,
DROP COLUMN "paid_method",
ADD COLUMN     "paid_method" TEXT;

-- AlterTable
ALTER TABLE "part_items" ALTER COLUMN "manufacturer_serial" SET NOT NULL;

-- AlterTable
ALTER TABLE "sites" DROP COLUMN "city",
DROP COLUMN "latitude",
DROP COLUMN "longitude",
DROP COLUMN "site_type",
DROP COLUMN "zone",
DROP COLUMN "zone_id";

-- AlterTable
ALTER TABLE "trip_revenues" DROP COLUMN "approval_notes",
DROP COLUMN "is_approved",
DROP COLUMN "is_current",
DROP COLUMN "pricing_rule_id",
DROP COLUMN "pricing_rule_snapshot",
DROP COLUMN "replaced_at",
DROP COLUMN "replaced_by",
DROP COLUMN "version_no";

-- AlterTable
ALTER TABLE "trips" DROP COLUMN "cargo_type_id",
DROP COLUMN "dropoff_site_id",
DROP COLUMN "pickup_site_id",
DROP COLUMN "route_id",
ADD COLUMN     "cargo_type" TEXT,
ALTER COLUMN "site_id" SET NOT NULL,
DROP COLUMN "trip_type",
ADD COLUMN     "trip_type" TEXT;

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "vehicle_class_id";

-- AlterTable
ALTER TABLE "vendor_transactions" DROP COLUMN "currency",
DROP COLUMN "posted_at";

-- DropTable
DROP TABLE "cargo_types";

-- DropTable
DROP TABLE "contract_pricing_rules";

-- DropTable
DROP TABLE "routes";

-- DropTable
DROP TABLE "vehicle_classes";

-- DropTable
DROP TABLE "zones";

-- DropEnum
DROP TYPE "advance_settlement_type";

-- DropEnum
DROP TYPE "expense_appeal_status";

-- DropEnum
DROP TYPE "payment_method";

-- DropEnum
DROP TYPE "trip_type_enum";

-- CreateIndex
CREATE UNIQUE INDEX "part_items_manufacturer_serial_key" ON "part_items"("manufacturer_serial");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
