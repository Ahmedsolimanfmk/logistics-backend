-- CreateEnum
CREATE TYPE "vendor_transaction_status" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "vendor_transactions" ADD COLUMN     "status" "vendor_transaction_status" NOT NULL DEFAULT 'APPROVED';

-- AddForeignKey
ALTER TABLE "vendor_transactions" ADD CONSTRAINT "vendor_transactions_related_cash_expense_id_fkey" FOREIGN KEY ("related_cash_expense_id") REFERENCES "cash_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_transactions" ADD CONSTRAINT "vendor_transactions_related_work_order_id_fkey" FOREIGN KEY ("related_work_order_id") REFERENCES "maintenance_work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_transactions" ADD CONSTRAINT "vendor_transactions_related_inventory_receipt_id_fkey" FOREIGN KEY ("related_inventory_receipt_id") REFERENCES "inventory_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
