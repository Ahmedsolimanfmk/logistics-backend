/*
  Warnings:

  - You are about to drop the column `expense_source` on the `cash_expenses` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "idx_cash_expenses_expense_source";

-- AlterTable
ALTER TABLE "cash_expenses" DROP COLUMN "expense_source",
ADD COLUMN     "invoice_date" TIMESTAMPTZ(6),
ADD COLUMN     "invoice_no" TEXT,
ADD COLUMN     "invoice_total" DECIMAL(12,2),
ADD COLUMN     "paid_method" TEXT,
ADD COLUMN     "payment_ref" TEXT,
ADD COLUMN     "payment_source" "cash_payment_source" NOT NULL DEFAULT 'ADVANCE',
ADD COLUMN     "vat_amount" DECIMAL(12,2),
ADD COLUMN     "vendor_name" TEXT;

-- CreateIndex
CREATE INDEX "idx_cash_expenses_payment_source" ON "cash_expenses"("payment_source");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_vendor_name" ON "cash_expenses"("vendor_name");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_invoice_no" ON "cash_expenses"("invoice_no");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_invoice_date" ON "cash_expenses"("invoice_date");
