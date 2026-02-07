-- Sync indexes that exist in DB (to eliminate drift)

-- trips indexes
CREATE INDEX IF NOT EXISTS "trips_created_at_idx" ON "trips" ("created_at");
CREATE INDEX IF NOT EXISTS "trips_financial_closed_at_idx" ON "trips" ("financial_closed_at");
CREATE INDEX IF NOT EXISTS "trips_status_idx" ON "trips" ("status");

-- trip_assignments indexes
CREATE INDEX IF NOT EXISTS "trip_assignments_field_supervisor_id_trip_id_idx"
ON "trip_assignments" ("field_supervisor_id", "trip_id");

CREATE INDEX IF NOT EXISTS "trip_assignments_trip_id_is_active_idx"
ON "trip_assignments" ("trip_id", "is_active");
