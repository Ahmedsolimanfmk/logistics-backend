/*
  Warnings:

  - Made the column `company_id` on table `clients` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `departments` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `fleets` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `sites` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "departments" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "fleets" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "sites" ALTER COLUMN "company_id" SET NOT NULL;
