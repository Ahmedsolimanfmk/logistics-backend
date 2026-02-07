BEGIN;

CREATE TABLE IF NOT EXISTS "maintenance_requests" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),

  "vehicle_id" uuid NOT NULL,
  "requested_by" uuid NOT NULL,

  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  -- SUBMITTED | APPROVED | REJECTED | CANCELED

  "problem_title" TEXT NOT NULL,
  "problem_description" TEXT,

  "requested_at" timestamptz NOT NULL DEFAULT now(),

  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "rejection_reason" TEXT,

  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- FK vehicle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='maintenance_requests'
      AND constraint_name='maintenance_requests_vehicle_id_fkey'
  ) THEN
    ALTER TABLE "maintenance_requests"
      ADD CONSTRAINT "maintenance_requests_vehicle_id_fkey"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
      ON DELETE RESTRICT;
  END IF;
END$$;

-- FK user (requested_by)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='maintenance_requests'
      AND constraint_name='maintenance_requests_requested_by_fkey'
  ) THEN
    ALTER TABLE "maintenance_requests"
      ADD CONSTRAINT "maintenance_requests_requested_by_fkey"
      FOREIGN KEY ("requested_by") REFERENCES "users"("id")
      ON DELETE RESTRICT;
  END IF;
END$$;

-- FK user (reviewed_by)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name='maintenance_requests'
      AND constraint_name='maintenance_requests_reviewed_by_fkey'
  ) THEN
    ALTER TABLE "maintenance_requests"
      ADD CONSTRAINT "maintenance_requests_reviewed_by_fkey"
      FOREIGN KEY ("reviewed_by") REFERENCES "users"("id")
      ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_mr_vehicle_id" ON "maintenance_requests" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_mr_status" ON "maintenance_requests" ("status");
CREATE INDEX IF NOT EXISTS "idx_mr_requested_at" ON "maintenance_requests" ("requested_at");

COMMIT;
