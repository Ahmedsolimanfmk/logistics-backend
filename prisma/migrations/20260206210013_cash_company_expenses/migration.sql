/*
  Warnings:

  - You are about to drop the column `payment_source` on the `cash_expenses` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "idx_cash_expenses_approval_status";

-- DropIndex
DROP INDEX "idx_cash_expenses_created_by";

-- DropIndex
DROP INDEX "idx_cash_expenses_payment_source";

-- AlterTable
ALTER TABLE "cash_expenses" DROP COLUMN "payment_source";
