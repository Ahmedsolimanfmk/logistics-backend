-- Dashboard performance indexes (PostgreSQL)

-- =========================
-- trips
-- =========================
CREATE INDEX IF NOT EXISTS "idx_trips_created_at"
ON "trips" ("created_at");

CREATE INDEX IF NOT EXISTS "idx_trips_status"
ON "trips" ("status");

CREATE INDEX IF NOT EXISTS "idx_trips_created_at_status"
ON "trips" ("created_at", "status");

CREATE INDEX IF NOT EXISTS "idx_trips_client_site_created_at"
ON "trips" ("client_id", "site_id", "created_at");

CREATE INDEX IF NOT EXISTS "idx_trips_financial_closed_at"
ON "trips" ("financial_closed_at");

-- =========================
-- trip_assignments
-- =========================
CREATE INDEX IF NOT EXISTS "idx_trip_assignments_trip_id"
ON "trip_assignments" ("trip_id");

CREATE INDEX IF NOT EXISTS "idx_trip_assignments_is_active"
ON "trip_assignments" ("is_active");

CREATE INDEX IF NOT EXISTS "idx_trip_assignments_trip_active"
ON "trip_assignments" ("trip_id", "is_active");

CREATE INDEX IF NOT EXISTS "idx_trip_assignments_assigned_at"
ON "trip_assignments" ("assigned_at");

CREATE INDEX IF NOT EXISTS "idx_trip_assignments_supervisor_active"
ON "trip_assignments" ("field_supervisor_id", "is_active");

CREATE INDEX IF NOT EXISTS "idx_trip_assignments_driver_id"
ON "trip_assignments" ("driver_id");

CREATE INDEX IF NOT EXISTS "idx_trip_assignments_vehicle_id"
ON "trip_assignments" ("vehicle_id");

-- =========================
-- cash_expenses
-- =========================
CREATE INDEX IF NOT EXISTS "idx_cash_expenses_created_at"
ON "cash_expenses" ("created_at");

CREATE INDEX IF NOT EXISTS "idx_cash_expenses_approval_status"
ON "cash_expenses" ("approval_status");

CREATE INDEX IF NOT EXISTS "idx_cash_expenses_created_at_status"
ON "cash_expenses" ("created_at", "approval_status");

CREATE INDEX IF NOT EXISTS "idx_cash_expenses_trip_id"
ON "cash_expenses" ("trip_id");

CREATE INDEX IF NOT EXISTS "idx_cash_expenses_cash_advance_id"
ON "cash_expenses" ("cash_advance_id");

CREATE INDEX IF NOT EXISTS "idx_cash_expenses_vehicle_id"
ON "cash_expenses" ("vehicle_id");

-- =========================
-- cash_advances
-- =========================
CREATE INDEX IF NOT EXISTS "idx_cash_advances_status"
ON "cash_advances" ("status");

CREATE INDEX IF NOT EXISTS "idx_cash_advances_created_at"
ON "cash_advances" ("created_at");

CREATE INDEX IF NOT EXISTS "idx_cash_advances_supervisor_status_created"
ON "cash_advances" ("field_supervisor_id", "status", "created_at");

-- =========================
-- vehicles
-- =========================
CREATE INDEX IF NOT EXISTS "idx_vehicles_status"
ON "vehicles" ("status");

CREATE INDEX IF NOT EXISTS "idx_vehicles_plate_number"
ON "vehicles" ("plate_number");
