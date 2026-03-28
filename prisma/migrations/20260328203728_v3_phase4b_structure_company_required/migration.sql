/*
  Warnings:

  - Made the column `company_id` on table `fleet_site_assignments` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `fleet_vehicles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `supervisor_assignments` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "fleet_site_assignments" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "fleet_vehicles" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "supervisor_assignments" ALTER COLUMN "company_id" SET NOT NULL;
