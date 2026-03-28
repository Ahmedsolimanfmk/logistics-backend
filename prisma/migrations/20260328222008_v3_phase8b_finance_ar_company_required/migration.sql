/*
  Warnings:

  - Made the column `company_id` on table `ar_invoice_trip_lines` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `ar_invoices` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `ar_payment_allocations` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `ar_payments` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `cash_advances` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `cash_expense_audits` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `cash_expenses` required. This step will fail if there are existing NULL values in that column.
  - Made the column `company_id` on table `vendor_transactions` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ar_invoice_trip_lines" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "ar_invoices" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "ar_payment_allocations" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "ar_payments" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "cash_advances" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "cash_expense_audits" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "cash_expenses" ALTER COLUMN "company_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "vendor_transactions" ALTER COLUMN "company_id" SET NOT NULL;
