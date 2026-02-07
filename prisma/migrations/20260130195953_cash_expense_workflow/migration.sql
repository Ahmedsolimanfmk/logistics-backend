-- 0) Ensure uuid extension exists (often already)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) Add columns (safe)
ALTER TABLE "cash_expenses"
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "rejected_by" UUID,
  ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "appeal_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "appealed_by" UUID,
  ADD COLUMN IF NOT EXISTS "appealed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "resolved_by" UUID,
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ;

-- 2) Foreign keys (add only if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cash_expenses_rejected_by'
  ) THEN
    ALTER TABLE "cash_expenses"
      ADD CONSTRAINT "fk_cash_expenses_rejected_by"
      FOREIGN KEY ("rejected_by") REFERENCES "users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cash_expenses_appealed_by'
  ) THEN
    ALTER TABLE "cash_expenses"
      ADD CONSTRAINT "fk_cash_expenses_appealed_by"
      FOREIGN KEY ("appealed_by") REFERENCES "users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cash_expenses_resolved_by'
  ) THEN
    ALTER TABLE "cash_expenses"
      ADD CONSTRAINT "fk_cash_expenses_resolved_by"
      FOREIGN KEY ("resolved_by") REFERENCES "users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

-- 3) Check constraint: allowed approval_status values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cash_expenses_approval_status'
  ) THEN
    ALTER TABLE "cash_expenses"
      ADD CONSTRAINT "chk_cash_expenses_approval_status"
      CHECK ("approval_status" IN ('PENDING','APPROVED','REJECTED','APPEALED','REAPPROVED'));
  END IF;
END $$;

-- 4) Consistency checks (optional but recommended)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cash_expenses_reject_fields'
  ) THEN
    ALTER TABLE "cash_expenses"
      ADD CONSTRAINT "chk_cash_expenses_reject_fields"
      CHECK (
        "approval_status" <> 'REJECTED'
        OR ("rejected_by" IS NOT NULL AND "rejected_at" IS NOT NULL AND "rejection_reason" IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cash_expenses_appeal_fields'
  ) THEN
    ALTER TABLE "cash_expenses"
      ADD CONSTRAINT "chk_cash_expenses_appeal_fields"
      CHECK (
        "approval_status" <> 'APPEALED'
        OR ("appealed_by" IS NOT NULL AND "appealed_at" IS NOT NULL AND "appeal_notes" IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cash_expenses_approve_fields'
  ) THEN
    ALTER TABLE "cash_expenses"
      ADD CONSTRAINT "chk_cash_expenses_approve_fields"
      CHECK (
        "approval_status" NOT IN ('APPROVED','REAPPROVED')
        OR ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL)
      );
  END IF;
END $$;

-- 5) Audit table (optional)
CREATE TABLE IF NOT EXISTS "cash_expense_audits" (
  "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "expense_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "actor_id" UUID NULL,
  "notes" TEXT NULL,
  "before" TEXT NULL,
  "after" TEXT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cash_expense_audits_expense'
  ) THEN
    ALTER TABLE "cash_expense_audits"
      ADD CONSTRAINT "fk_cash_expense_audits_expense"
      FOREIGN KEY ("expense_id") REFERENCES "cash_expenses"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cash_expense_audits_actor'
  ) THEN
    ALTER TABLE "cash_expense_audits"
      ADD CONSTRAINT "fk_cash_expense_audits_actor"
      FOREIGN KEY ("actor_id") REFERENCES "users"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_cash_expense_audits_expense_created_at"
  ON "cash_expense_audits"("expense_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_cash_expense_audits_actor_created_at"
  ON "cash_expense_audits"("actor_id", "created_at" DESC);
