-- Remove duplicate/alternate index names to eliminate drift

DROP INDEX IF EXISTS "idx_trip_assignments_supervisor_trip";
DROP INDEX IF EXISTS "idx_trip_assignments_trip_active";
DROP INDEX IF EXISTS "idx_trips_fin_closed";
DROP INDEX IF EXISTS "idx_trips_status";
