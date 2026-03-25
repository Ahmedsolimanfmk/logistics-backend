/*
  Warnings:

  - The `settlement_type` column on the `cash_advances` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `appeal_status` column on the `cash_expenses` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `paid_method` column on the `cash_expenses` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `cargo_type` on the `trips` table. All the data in the column will be lost.
  - The `trip_type` column on the `trips` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `role` on the `users` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'FIELD_SUPERVISOR', 'GENERAL_SUPERVISOR', 'DEPT_MANAGER', 'GENERAL_MANAGER', 'GENERAL_RESPONSIBLE', 'CONTRACT_MANAGER', 'STOREKEEPER', 'HR', 'ACCOUNTANT', 'DISPATCHER', 'OPERATIONS', 'MAINTENANCE_MANAGER');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "expense_appeal_status" AS ENUM ('OPEN', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "advance_settlement_type" AS ENUM ('FULL', 'PARTIAL', 'ADJUSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "trip_type_enum" AS ENUM ('DELIVERY', 'TRANSFER', 'RETURN', 'INTERNAL', 'OTHER');

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_site_id_fkey";

-- DropIndex
DROP INDEX "part_items_manufacturer_serial_key";

-- AlterTable
ALTER TABLE "cash_advances" DROP COLUMN "settlement_type",
ADD COLUMN     "settlement_type" "advance_settlement_type";

-- AlterTable
ALTER TABLE "cash_expenses" DROP COLUMN "appeal_status",
ADD COLUMN     "appeal_status" "expense_appeal_status",
DROP COLUMN "paid_method",
ADD COLUMN     "paid_method" "payment_method";

-- AlterTable
ALTER TABLE "part_items" ALTER COLUMN "manufacturer_serial" DROP NOT NULL;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "city" TEXT,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "site_type" TEXT,
ADD COLUMN     "zone" TEXT,
ADD COLUMN     "zone_id" UUID;

-- AlterTable
ALTER TABLE "trip_revenues" ADD COLUMN     "approval_notes" TEXT,
ADD COLUMN     "is_approved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_current" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pricing_rule_id" UUID,
ADD COLUMN     "pricing_rule_snapshot" JSONB,
ADD COLUMN     "replaced_at" TIMESTAMPTZ(6),
ADD COLUMN     "replaced_by" UUID,
ADD COLUMN     "version_no" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "trips" DROP COLUMN "cargo_type",
ADD COLUMN     "cargo_type_id" UUID,
ADD COLUMN     "contract_id" UUID,
ADD COLUMN     "dropoff_site_id" UUID,
ADD COLUMN     "pickup_site_id" UUID,
ADD COLUMN     "route_id" UUID,
ALTER COLUMN "site_id" DROP NOT NULL,
DROP COLUMN "trip_type",
ADD COLUMN     "trip_type" "trip_type_enum";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "role",
ADD COLUMN     "role" "user_role" NOT NULL;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "vehicle_class_id" UUID;

-- AlterTable
ALTER TABLE "vendor_transactions" ADD COLUMN     "currency" TEXT DEFAULT 'EGP',
ADD COLUMN     "posted_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "vehicle_classes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargo_types" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cargo_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "code" TEXT,
    "name" TEXT NOT NULL,
    "client_id" UUID,
    "pickup_site_id" UUID,
    "dropoff_site_id" UUID,
    "origin_label" TEXT,
    "destination_label" TEXT,
    "distance_km" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_pricing_rules" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "contract_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "route_id" UUID,
    "pickup_site_id" UUID,
    "dropoff_site_id" UUID,
    "from_zone_id" UUID,
    "to_zone_id" UUID,
    "vehicle_class_id" UUID,
    "cargo_type_id" UUID,
    "trip_type" "trip_type_enum",
    "min_weight" DECIMAL(12,3),
    "max_weight" DECIMAL(12,3),
    "base_price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT DEFAULT 'EGP',
    "price_per_ton" DECIMAL(12,2),
    "price_per_km" DECIMAL(12,2),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "effective_from" TIMESTAMPTZ(6),
    "effective_to" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_classes_code_key" ON "vehicle_classes"("code");

-- CreateIndex
CREATE INDEX "idx_vehicle_classes_name" ON "vehicle_classes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "zones_code_key" ON "zones"("code");

-- CreateIndex
CREATE INDEX "idx_zones_name" ON "zones"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cargo_types_code_key" ON "cargo_types"("code");

-- CreateIndex
CREATE INDEX "idx_cargo_types_name" ON "cargo_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "routes_code_key" ON "routes"("code");

-- CreateIndex
CREATE INDEX "idx_routes_client_id" ON "routes"("client_id");

-- CreateIndex
CREATE INDEX "idx_routes_pickup_site_id" ON "routes"("pickup_site_id");

-- CreateIndex
CREATE INDEX "idx_routes_dropoff_site_id" ON "routes"("dropoff_site_id");

-- CreateIndex
CREATE INDEX "idx_contract_pricing_rules_contract_id" ON "contract_pricing_rules"("contract_id");

-- CreateIndex
CREATE INDEX "idx_contract_pricing_rules_client_id" ON "contract_pricing_rules"("client_id");

-- CreateIndex
CREATE INDEX "idx_contract_pricing_rules_route_id" ON "contract_pricing_rules"("route_id");

-- CreateIndex
CREATE INDEX "idx_contract_pricing_rules_vehicle_class_id" ON "contract_pricing_rules"("vehicle_class_id");

-- CreateIndex
CREATE INDEX "idx_contract_pricing_rules_cargo_type_id" ON "contract_pricing_rules"("cargo_type_id");

-- CreateIndex
CREATE INDEX "idx_contract_pricing_rules_pickup_site_id" ON "contract_pricing_rules"("pickup_site_id");

-- CreateIndex
CREATE INDEX "idx_contract_pricing_rules_dropoff_site_id" ON "contract_pricing_rules"("dropoff_site_id");

-- CreateIndex
CREATE INDEX "idx_contract_pricing_rules_from_zone_id" ON "contract_pricing_rules"("from_zone_id");

-- CreateIndex
CREATE INDEX "idx_contract_pricing_rules_to_zone_id" ON "contract_pricing_rules"("to_zone_id");

-- CreateIndex
CREATE INDEX "idx_contract_pricing_rules_priority" ON "contract_pricing_rules"("priority");

-- CreateIndex
CREATE INDEX "idx_mwo_created_by" ON "maintenance_work_orders"("created_by");

-- CreateIndex
CREATE INDEX "idx_sites_zone_id" ON "sites"("zone_id");

-- CreateIndex
CREATE INDEX "idx_trip_revenues_pricing_rule_id" ON "trip_revenues"("pricing_rule_id");

-- CreateIndex
CREATE INDEX "idx_trip_revenues_trip_current" ON "trip_revenues"("trip_id", "is_current");

-- CreateIndex
CREATE INDEX "idx_trip_revenues_trip_version" ON "trip_revenues"("trip_id", "version_no");

-- CreateIndex
CREATE INDEX "idx_trips_contract_id" ON "trips"("contract_id");

-- CreateIndex
CREATE INDEX "idx_trips_pickup_site_id" ON "trips"("pickup_site_id");

-- CreateIndex
CREATE INDEX "idx_trips_dropoff_site_id" ON "trips"("dropoff_site_id");

-- CreateIndex
CREATE INDEX "idx_trips_route_id" ON "trips"("route_id");

-- CreateIndex
CREATE INDEX "idx_trips_cargo_type_id" ON "trips"("cargo_type_id");

-- CreateIndex
CREATE INDEX "idx_vehicles_vehicle_class_id" ON "vehicles"("vehicle_class_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_vehicle_class_id_fkey" FOREIGN KEY ("vehicle_class_id") REFERENCES "vehicle_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_pickup_site_id_fkey" FOREIGN KEY ("pickup_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_dropoff_site_id_fkey" FOREIGN KEY ("dropoff_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "client_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_pickup_site_id_fkey" FOREIGN KEY ("pickup_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_dropoff_site_id_fkey" FOREIGN KEY ("dropoff_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_cargo_type_id_fkey" FOREIGN KEY ("cargo_type_id") REFERENCES "cargo_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_pricing_rule_id_fkey" FOREIGN KEY ("pricing_rule_id") REFERENCES "contract_pricing_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_replaced_by_fkey" FOREIGN KEY ("replaced_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "client_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_pickup_site_id_fkey" FOREIGN KEY ("pickup_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_dropoff_site_id_fkey" FOREIGN KEY ("dropoff_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_from_zone_id_fkey" FOREIGN KEY ("from_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_to_zone_id_fkey" FOREIGN KEY ("to_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_vehicle_class_id_fkey" FOREIGN KEY ("vehicle_class_id") REFERENCES "vehicle_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_cargo_type_id_fkey" FOREIGN KEY ("cargo_type_id") REFERENCES "cargo_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
