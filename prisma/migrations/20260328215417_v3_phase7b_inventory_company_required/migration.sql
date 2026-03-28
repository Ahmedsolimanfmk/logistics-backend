/*
  Warnings:

  - Made the column `company_id` on table `inventory_issue_lines` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `inventory_issues` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `inventory_receipt_bulk_lines` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `inventory_receipt_items` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `inventory_receipts` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `inventory_request_lines` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `inventory_request_reservations` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `inventory_requests` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `part_items` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `warehouse_parts` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `work_order_installations` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "inventory_issue_lines" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "inventory_issues" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "inventory_receipt_bulk_lines" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "inventory_receipt_items" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "inventory_receipts" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "inventory_request_lines" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "inventory_request_reservations" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "inventory_requests" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "part_items" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "warehouse_parts" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "work_order_installations" ALTER COLUMN "company_id" SET NOT NULL;
