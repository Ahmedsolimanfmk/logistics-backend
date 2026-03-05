/*
  Warnings:

  - A unique constraint covering the columns `[national_id]` on the table `drivers` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "driver_status" AS ENUM ('ACTIVE', 'INACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "driver_disable_reason" AS ENUM ('LICENSE_EXPIRED', 'ADMIN', 'OTHER');

-- CreateEnum
CREATE TYPE "vehicle_disable_reason" AS ENUM ('LICENSE_EXPIRED', 'MAINTENANCE', 'ADMIN', 'OTHER');

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "disable_reason" "driver_disable_reason",
ADD COLUMN     "hire_date" TIMESTAMPTZ(6),
ADD COLUMN     "license_expiry_date" TIMESTAMPTZ(6),
ADD COLUMN     "license_issue_date" TIMESTAMPTZ(6),
ADD COLUMN     "national_id" TEXT,
ADD COLUMN     "phone2" TEXT,
ADD COLUMN     "status" "driver_status" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "disable_reason" "vehicle_disable_reason",
ADD COLUMN     "license_expiry_date" TIMESTAMPTZ(6),
ADD COLUMN     "license_issue_date" TIMESTAMPTZ(6),
ADD COLUMN     "license_no" TEXT;

-- CreateIndex
CREATE INDEX "drivers_status_idx" ON "drivers"("status");

-- CreateIndex
CREATE INDEX "drivers_license_expiry_date_idx" ON "drivers"("license_expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_national_id_key" ON "drivers"("national_id");

-- CreateIndex
CREATE INDEX "idx_vehicles_license_expiry" ON "vehicles"("license_expiry_date");

-- CreateIndex
CREATE INDEX "idx_vehicles_status" ON "vehicles"("status");
