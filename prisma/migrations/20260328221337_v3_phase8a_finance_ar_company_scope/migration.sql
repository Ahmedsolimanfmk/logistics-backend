-- AlterTable
ALTER TABLE "ar_invoice_trip_lines" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "ar_invoices" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "ar_payment_allocations" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "ar_payments" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "cash_advances" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "cash_expense_audits" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "cash_expenses" ADD COLUMN     "company_id" UUID;

-- AlterTable
ALTER TABLE "vendor_transactions" ADD COLUMN     "company_id" UUID;

-- CreateIndex
CREATE INDEX "idx_ar_invoice_trip_lines_company_id" ON "ar_invoice_trip_lines"("company_id");

-- CreateIndex
CREATE INDEX "idx_ar_invoices_company_id" ON "ar_invoices"("company_id");

-- CreateIndex
CREATE INDEX "idx_ar_payment_allocations_company_id" ON "ar_payment_allocations"("company_id");

-- CreateIndex
CREATE INDEX "idx_ar_payments_company_id" ON "ar_payments"("company_id");

-- CreateIndex
CREATE INDEX "idx_cash_advances_company_id" ON "cash_advances"("company_id");

-- CreateIndex
CREATE INDEX "idx_cash_expense_audits_company_id" ON "cash_expense_audits"("company_id");

-- CreateIndex
CREATE INDEX "idx_cash_expenses_company_id" ON "cash_expenses"("company_id");

-- CreateIndex
CREATE INDEX "idx_vendor_transactions_company_id" ON "vendor_transactions"("company_id");

-- AddForeignKey
ALTER TABLE "vendor_transactions" ADD CONSTRAINT "vendor_transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_payment_allocations" ADD CONSTRAINT "ar_payment_allocations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoice_trip_lines" ADD CONSTRAINT "ar_invoice_trip_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_advances" ADD CONSTRAINT "cash_advances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_expenses" ADD CONSTRAINT "cash_expenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_expense_audits" ADD CONSTRAINT "cash_expense_audits_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
