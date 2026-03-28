/*
  Warnings:

  - A unique constraint covering the columns `[company_id,employee_code]` on the table `drivers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,phone]` on the table `drivers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,phone2]` on the table `drivers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,national_id]` on the table `drivers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,license_no]` on the table `drivers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,part_number]` on the table `parts` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,fleet_no]` on the table `vehicles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,plate_no]` on the table `vehicles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,chassis_no]` on the table `vehicles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,engine_no]` on the table `vehicles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,code]` on the table `vendors` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,code]` on the table `warehouses` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,name]` on the table `warehouses` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "drivers_employee_code_key";

-- DropIndex
DROP INDEX "drivers_license_no_key";

-- DropIndex
DROP INDEX "drivers_national_id_key";

-- DropIndex
DROP INDEX "drivers_phone2_key";

-- DropIndex
DROP INDEX "drivers_phone_key";

-- DropIndex
DROP INDEX "parts_part_number_key";

-- DropIndex
DROP INDEX "vehicles_chassis_no_key";

-- DropIndex
DROP INDEX "vehicles_engine_no_key";

-- DropIndex
DROP INDEX "vehicles_fleet_no_key";

-- DropIndex
DROP INDEX "vehicles_plate_no_key";

-- DropIndex
DROP INDEX "vendors_code_key";

-- DropIndex
DROP INDEX "warehouses_code_key";

-- DropIndex
DROP INDEX "warehouses_name_key";

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "parts" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "company_id" UUID;

-- CreateIndex
CREATE INDEX "idx_drivers_company_id" ON "drivers"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_drivers_company_employee_code" ON "drivers"("company_id", "employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_drivers_company_phone" ON "drivers"("company_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "uq_drivers_company_phone2" ON "drivers"("company_id", "phone2");

-- CreateIndex
CREATE UNIQUE INDEX "uq_drivers_company_national_id" ON "drivers"("company_id", "national_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_drivers_company_license_no" ON "drivers"("company_id", "license_no");

-- CreateIndex
CREATE INDEX "idx_parts_company_id" ON "parts"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_parts_company_part_number" ON "parts"("company_id", "part_number");

-- CreateIndex
CREATE INDEX "idx_vehicles_company_id" ON "vehicles"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_vehicles_company_fleet_no" ON "vehicles"("company_id", "fleet_no");

-- CreateIndex
CREATE UNIQUE INDEX "uq_vehicles_company_plate_no" ON "vehicles"("company_id", "plate_no");

-- CreateIndex
CREATE UNIQUE INDEX "uq_vehicles_company_chassis_no" ON "vehicles"("company_id", "chassis_no");

-- CreateIndex
CREATE UNIQUE INDEX "uq_vehicles_company_engine_no" ON "vehicles"("company_id", "engine_no");

-- CreateIndex
CREATE INDEX "idx_vendors_company_id" ON "vendors"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_vendors_company_code" ON "vendors"("company_id", "code");

-- CreateIndex
CREATE INDEX "idx_warehouses_company_id" ON "warehouses"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_warehouses_company_code" ON "warehouses"("company_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_warehouses_company_name" ON "warehouses"("company_id", "name");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
