DROP INDEX IF EXISTS "idx_cash_expense_audits_actor_created_at";
DROP INDEX IF EXISTS "idx_cash_expense_audits_expense_created_at";


-- CreateIndex
CREATE INDEX "cash_expense_audits_expense_id_created_at_idx" ON "cash_expense_audits"("expense_id", "created_at");

-- CreateIndex
CREATE INDEX "cash_expense_audits_actor_id_created_at_idx" ON "cash_expense_audits"("actor_id", "created_at");

-- RenameForeignKey
ALTER TABLE "cash_expense_audits" RENAME CONSTRAINT "fk_cash_expense_audits_actor" TO "cash_expense_audits_actor_id_fkey";

-- RenameForeignKey
ALTER TABLE "cash_expense_audits" RENAME CONSTRAINT "fk_cash_expense_audits_expense" TO "cash_expense_audits_expense_id_fkey";

-- RenameForeignKey
ALTER TABLE "cash_expenses" RENAME CONSTRAINT "fk_cash_expenses_appealed_by" TO "cash_expenses_appealed_by_fkey";

-- RenameForeignKey
ALTER TABLE "cash_expenses" RENAME CONSTRAINT "fk_cash_expenses_rejected_by" TO "cash_expenses_rejected_by_fkey";

-- RenameForeignKey
ALTER TABLE "cash_expenses" RENAME CONSTRAINT "fk_cash_expenses_resolved_by" TO "cash_expenses_resolved_by_fkey";
