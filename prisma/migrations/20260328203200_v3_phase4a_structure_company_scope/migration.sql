-- AlterTable
ALTER TABLE "fleet_site_assignments" ADD COLUMN     "company_id" UUID,
ADD COLUMN     "company_usersId" UUID;

-- AlterTable
ALTER TABLE "fleet_vehicles" ADD COLUMN     "company_id" UUID,
ADD COLUMN     "company_usersId" UUID;

-- AlterTable
ALTER TABLE "supervisor_assignments" ADD COLUMN     "company_id" UUID,
ADD COLUMN     "company_usersId" UUID;

-- CreateIndex
CREATE INDEX "idx_fleet_site_assignments_company_id" ON "fleet_site_assignments"("company_id");

-- CreateIndex
CREATE INDEX "idx_fleet_vehicles_company_id" ON "fleet_vehicles"("company_id");

-- CreateIndex
CREATE INDEX "idx_supervisor_assignments_company_id" ON "supervisor_assignments"("company_id");

-- AddForeignKey
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_company_usersId_fkey" FOREIGN KEY ("company_usersId") REFERENCES "company_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_site_assignments" ADD CONSTRAINT "fleet_site_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_site_assignments" ADD CONSTRAINT "fleet_site_assignments_company_usersId_fkey" FOREIGN KEY ("company_usersId") REFERENCES "company_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_company_usersId_fkey" FOREIGN KEY ("company_usersId") REFERENCES "company_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
