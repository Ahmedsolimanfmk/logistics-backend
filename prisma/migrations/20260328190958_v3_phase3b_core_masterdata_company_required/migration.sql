/*
  Warnings:

  - Made the column `company_id` on table `drivers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `parts` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `vehicles` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `vendors` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `warehouses` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "drivers" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "parts" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "vehicles" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "vendors" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "warehouses" ALTER COLUMN "company_id" SET NOT NULL;
