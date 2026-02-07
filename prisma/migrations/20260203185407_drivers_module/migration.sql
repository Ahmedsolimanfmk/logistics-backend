/*
  Warnings:

  - A unique constraint covering the columns `[phone]` on the table `drivers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[license_no]` on the table `drivers` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "drivers" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "drivers_is_active_idx" ON "drivers"("is_active");

-- CreateIndex
CREATE INDEX "drivers_full_name_idx" ON "drivers"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_phone_key" ON "drivers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_license_no_key" ON "drivers"("license_no");
