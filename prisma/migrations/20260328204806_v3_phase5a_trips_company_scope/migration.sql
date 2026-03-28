/*
  Warnings:

  - A unique constraint covering the columns `[company_id,trip_code]` on the table `trips` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "trips_trip_code_key";

-- AlterTable
ALTER TABLE "trip_assignments" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "trip_events" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "trip_revenues" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "company_id" UUID;

-- CreateIndex
CREATE INDEX "idx_trip_assignments_company_id" ON "trip_assignments"("company_id");

-- CreateIndex
CREATE INDEX "idx_trip_events_company_id" ON "trip_events"("company_id");

-- CreateIndex
CREATE INDEX "idx_trip_revenues_company_id" ON "trip_revenues"("company_id");

-- CreateIndex
CREATE INDEX "idx_trips_company_id" ON "trips"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_trips_company_trip_code" ON "trips"("company_id", "trip_code");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_revenues" ADD CONSTRAINT "trip_revenues_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_assignments" ADD CONSTRAINT "trip_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
