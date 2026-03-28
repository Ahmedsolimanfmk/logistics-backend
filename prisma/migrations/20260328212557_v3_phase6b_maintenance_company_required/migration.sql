/*
  Warnings:

  - Made the column `company_id` on table `maintenance_request_attachments` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `maintenance_requests` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `maintenance_work_order_events` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `maintenance_work_orders` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `post_maintenance_reports` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "maintenance_request_attachments" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "maintenance_requests" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "maintenance_work_order_events" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "maintenance_work_orders" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "post_maintenance_reports" ALTER COLUMN "company_id" SET NOT NULL;
