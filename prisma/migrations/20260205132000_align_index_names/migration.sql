-- Align actual DB index names with expected migration history (avoid drift)

-- trip_assignments: rename actual -> expected
DO $$ BEGIN
  ALTER INDEX IF EXISTS "idx_trip_assignments_supervisor_trip"
  RENAME TO "trip_assignments_field_supervisor_id_trip_id_idx";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER INDEX IF EXISTS "idx_trip_assignments_trip_active"
  RENAME TO "trip_assignments_trip_id_is_active_idx";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- trips: rename actual -> expected
DO $$ BEGIN
  ALTER INDEX IF EXISTS "idx_trips_fin_closed"
  RENAME TO "trips_financial_closed_at_idx";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER INDEX IF EXISTS "idx_trips_status"
  RENAME TO "trips_status_idx";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- trips(created_at): make sure expected index exists (name Prisma expects)
-- If your migrations expect "trips_created_at_idx", ensure it exists.
CREATE INDEX IF NOT EXISTS "trips_created_at_idx" ON "trips" ("created_at");
