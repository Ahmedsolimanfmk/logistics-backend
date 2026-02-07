-- ============================================
-- SAFE MAINTENANCE + INVENTORY TRACEABILITY
-- (No dropping existing foreign keys)
-- ============================================

BEGIN;

-- 0) Safety: rename plate_number -> plate_no if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='vehicles' AND column_name='plate_number'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='vehicles' AND column_name='plate_no'
  ) THEN
    ALTER TABLE "vehicles" RENAME COLUMN "plate_number" TO "plate_no";
  END IF;
END$$;

-- 1) Ensure vehicles columns exist (controller-compatible)
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "display_name" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "current_odometer" INTEGER;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "gps_device_id" TEXT;
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT TRUE;

-- Normalize old status if needed
UPDATE "vehicles"
SET "status" = 'AVAILABLE'
WHERE UPPER(COALESCE("status",'AVAILABLE')) = 'ACTIVE';

-- Ensure unique on plate_no (if not already)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='vehicles_plate_no_key'
  ) THEN
    -- create unique index (prisma style name often vehicles_plate_no_key)
    CREATE UNIQUE INDEX "vehicles_plate_no_key" ON "vehicles" ("plate_no");
  END IF;
END$$;

-- ===================================================
-- 2) Parts catalog
-- ===================================================
CREATE TABLE IF NOT EXISTS "parts" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "part_number" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "brand" TEXT,
  "unit" TEXT,
  "min_stock" INTEGER,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "parts_part_number_key" ON "parts" ("part_number");
CREATE INDEX IF NOT EXISTS "idx_parts_name" ON "parts" ("name");

-- ===================================================
-- 3) Maintenance Work Orders + events
-- ===================================================
CREATE TABLE IF NOT EXISTS "maintenance_work_orders" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "vehicle_id" uuid NOT NULL,

  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "type" TEXT NOT NULL DEFAULT 'CORRECTIVE',

  "vendor_name" TEXT,
  "opened_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz,

  "odometer" INTEGER,
  "notes" TEXT,

  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- FK: vehicle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type='FOREIGN KEY'
      AND table_name='maintenance_work_orders'
      AND constraint_name='maintenance_work_orders_vehicle_id_fkey'
  ) THEN
    ALTER TABLE "maintenance_work_orders"
      ADD CONSTRAINT "maintenance_work_orders_vehicle_id_fkey"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_mwo_vehicle_id" ON "maintenance_work_orders" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_mwo_status" ON "maintenance_work_orders" ("status");
CREATE INDEX IF NOT EXISTS "idx_mwo_type" ON "maintenance_work_orders" ("type");
CREATE INDEX IF NOT EXISTS "idx_mwo_opened_at" ON "maintenance_work_orders" ("opened_at");

CREATE TABLE IF NOT EXISTS "maintenance_work_order_events" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "work_order_id" uuid NOT NULL,
  "event_type" TEXT NOT NULL,
  "actor_id" uuid,
  "notes" TEXT,
  "payload" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type='FOREIGN KEY'
      AND table_name='maintenance_work_order_events'
      AND constraint_name='maintenance_work_order_events_work_order_id_fkey'
  ) THEN
    ALTER TABLE "maintenance_work_order_events"
      ADD CONSTRAINT "maintenance_work_order_events_work_order_id_fkey"
      FOREIGN KEY ("work_order_id") REFERENCES "maintenance_work_orders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_mwoe_work_order_id" ON "maintenance_work_order_events" ("work_order_id");
CREATE INDEX IF NOT EXISTS "idx_mwoe_event_type" ON "maintenance_work_order_events" ("event_type");

-- ===================================================
-- 4) Inventory Issues + Lines (صرف من المخزن)
-- ===================================================
CREATE TABLE IF NOT EXISTS "inventory_issues" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "work_order_id" uuid NOT NULL,
  "issued_by" uuid,
  "issued_at" timestamptz NOT NULL DEFAULT now(),
  "notes" TEXT,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type='FOREIGN KEY'
      AND table_name='inventory_issues'
      AND constraint_name='inventory_issues_work_order_id_fkey'
  ) THEN
    ALTER TABLE "inventory_issues"
      ADD CONSTRAINT "inventory_issues_work_order_id_fkey"
      FOREIGN KEY ("work_order_id") REFERENCES "maintenance_work_orders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_inventory_issues_work_order_id" ON "inventory_issues" ("work_order_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_issues_issued_at" ON "inventory_issues" ("issued_at");

CREATE TABLE IF NOT EXISTS "inventory_issue_lines" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "issue_id" uuid NOT NULL,
  "part_id" uuid NOT NULL,
  "qty" numeric(12,3) NOT NULL,
  "unit_cost" numeric(12,2) NOT NULL,
  "total_cost" numeric(12,2) NOT NULL,
  "notes" TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type='FOREIGN KEY'
      AND table_name='inventory_issue_lines'
      AND constraint_name='inventory_issue_lines_issue_id_fkey'
  ) THEN
    ALTER TABLE "inventory_issue_lines"
      ADD CONSTRAINT "inventory_issue_lines_issue_id_fkey"
      FOREIGN KEY ("issue_id") REFERENCES "inventory_issues"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type='FOREIGN KEY'
      AND table_name='inventory_issue_lines'
      AND constraint_name='inventory_issue_lines_part_id_fkey'
  ) THEN
    ALTER TABLE "inventory_issue_lines"
      ADD CONSTRAINT "inventory_issue_lines_part_id_fkey"
      FOREIGN KEY ("part_id") REFERENCES "parts"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_inventory_issue_lines_issue_id" ON "inventory_issue_lines" ("issue_id");
CREATE INDEX IF NOT EXISTS "idx_inventory_issue_lines_part_id" ON "inventory_issue_lines" ("part_id");

-- ===================================================
-- 5) Installation Trace (اتركبت في أنهي عربية + تاريخ + عداد)
-- ===================================================
CREATE TABLE IF NOT EXISTS "work_order_installations" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "work_order_id" uuid NOT NULL,
  "vehicle_id" uuid NOT NULL,
  "part_id" uuid NOT NULL,
  "qty_installed" numeric(12,3) NOT NULL,
  "installed_at" timestamptz NOT NULL DEFAULT now(),
  "odometer_at_install" INTEGER,
  "installed_by" TEXT,
  "warranty_until_date" timestamptz,
  "warranty_until_km" INTEGER,
  "notes" TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type='FOREIGN KEY'
      AND table_name='work_order_installations'
      AND constraint_name='work_order_installations_work_order_id_fkey'
  ) THEN
    ALTER TABLE "work_order_installations"
      ADD CONSTRAINT "work_order_installations_work_order_id_fkey"
      FOREIGN KEY ("work_order_id") REFERENCES "maintenance_work_orders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type='FOREIGN KEY'
      AND table_name='work_order_installations'
      AND constraint_name='work_order_installations_vehicle_id_fkey'
  ) THEN
    ALTER TABLE "work_order_installations"
      ADD CONSTRAINT "work_order_installations_vehicle_id_fkey"
      FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type='FOREIGN KEY'
      AND table_name='work_order_installations'
      AND constraint_name='work_order_installations_part_id_fkey'
  ) THEN
    ALTER TABLE "work_order_installations"
      ADD CONSTRAINT "work_order_installations_part_id_fkey"
      FOREIGN KEY ("part_id") REFERENCES "parts"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_woi_work_order_id" ON "work_order_installations" ("work_order_id");
CREATE INDEX IF NOT EXISTS "idx_woi_vehicle_id" ON "work_order_installations" ("vehicle_id");
CREATE INDEX IF NOT EXISTS "idx_woi_part_id" ON "work_order_installations" ("part_id");
CREATE INDEX IF NOT EXISTS "idx_woi_installed_at" ON "work_order_installations" ("installed_at");

-- ===================================================
-- 6) Post Maintenance Report
-- ===================================================
CREATE TABLE IF NOT EXISTS "post_maintenance_reports" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "work_order_id" uuid NOT NULL UNIQUE,
  "checked_by" uuid,
  "checked_at" timestamptz,
  "road_test_result" TEXT,
  "checklist_json" jsonb,
  "remarks" TEXT,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type='FOREIGN KEY'
      AND table_name='post_maintenance_reports'
      AND constraint_name='post_maintenance_reports_work_order_id_fkey'
  ) THEN
    ALTER TABLE "post_maintenance_reports"
      ADD CONSTRAINT "post_maintenance_reports_work_order_id_fkey"
      FOREIGN KEY ("work_order_id") REFERENCES "maintenance_work_orders"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_pmr_checked_at" ON "post_maintenance_reports" ("checked_at");

-- ===================================================
-- 7) Cash expenses link (optional but recommended)
-- ===================================================
ALTER TABLE "cash_expenses" ADD COLUMN IF NOT EXISTS "expense_source" TEXT NOT NULL DEFAULT 'CASH';
ALTER TABLE "cash_expenses" ADD COLUMN IF NOT EXISTS "maintenance_work_order_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type='FOREIGN KEY'
      AND table_name='cash_expenses'
      AND constraint_name='cash_expenses_maintenance_work_order_id_fkey'
  ) THEN
    ALTER TABLE "cash_expenses"
      ADD CONSTRAINT "cash_expenses_maintenance_work_order_id_fkey"
      FOREIGN KEY ("maintenance_work_order_id") REFERENCES "maintenance_work_orders"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "idx_cash_expenses_expense_source" ON "cash_expenses" ("expense_source");
CREATE INDEX IF NOT EXISTS "idx_cash_expenses_maintenance_work_order_id" ON "cash_expenses" ("maintenance_work_order_id");

COMMIT;
