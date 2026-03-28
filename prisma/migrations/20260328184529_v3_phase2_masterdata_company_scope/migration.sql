/*
  Warnings:

  - A unique constraint covering the columns `[company_id,code]` on the table `clients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,code]` on the table `departments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,code]` on the table `fleets` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[company_id,client_id,name]` on the table `sites` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "clients_code_key";

-- DropIndex
DROP INDEX "departments_code_key";

-- DropIndex
DROP INDEX "fleets_code_key";

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "fleets" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "company_id" UUID;

-- CreateIndex
CREATE INDEX "idx_clients_company_id" ON "clients"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_clients_company_code" ON "clients"("company_id", "code");

-- CreateIndex
CREATE INDEX "idx_departments_company_id" ON "departments"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_departments_company_code" ON "departments"("company_id", "code");

-- CreateIndex
CREATE INDEX "idx_fleets_company_id" ON "fleets"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_fleets_company_code" ON "fleets"("company_id", "code");

-- CreateIndex
CREATE INDEX "idx_sites_company_id" ON "sites"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_sites_company_client_name" ON "sites"("company_id", "client_id", "name");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleets" ADD CONSTRAINT "fleets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
