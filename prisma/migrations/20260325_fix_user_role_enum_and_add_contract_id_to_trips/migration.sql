-- ============================================
-- Fix user_role enum safely using temp column
-- ============================================

-- 1) Create the new enum if needed under a temp name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'user_role_new'
  ) THEN
    CREATE TYPE "user_role_new" AS ENUM (
      'ADMIN',
      'FIELD_SUPERVISOR',
      'GENERAL_SUPERVISOR',
      'DEPT_MANAGER',
      'GENERAL_MANAGER',
      'GENERAL_RESPONSIBLE',
      'CONTRACT_MANAGER',
      'STOREKEEPER',
      'HR',
      'ACCOUNTANT',
      'DISPATCHER',
      'OPERATIONS',
      'MAINTENANCE_MANAGER'
    );
  END IF;
END $$;

-- 2) Add temporary column
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "role_new" "user_role_new";

-- 3) Map existing values safely
UPDATE "users"
SET "role_new" = CASE UPPER(TRIM("role"::text))
  WHEN 'ADMIN' THEN 'ADMIN'::"user_role_new"
  WHEN 'FIELD_SUPERVISOR' THEN 'FIELD_SUPERVISOR'::"user_role_new"
  WHEN 'GENERAL_SUPERVISOR' THEN 'GENERAL_SUPERVISOR'::"user_role_new"
  WHEN 'DEPT_MANAGER' THEN 'DEPT_MANAGER'::"user_role_new"
  WHEN 'GENERAL_MANAGER' THEN 'GENERAL_MANAGER'::"user_role_new"
  WHEN 'GENERAL_RESPONSIBLE' THEN 'GENERAL_RESPONSIBLE'::"user_role_new"
  WHEN 'CONTRACT_MANAGER' THEN 'CONTRACT_MANAGER'::"user_role_new"
  WHEN 'STOREKEEPER' THEN 'STOREKEEPER'::"user_role_new"
  WHEN 'HR' THEN 'HR'::"user_role_new"
  WHEN 'ACCOUNTANT' THEN 'ACCOUNTANT'::"user_role_new"
  WHEN 'DISPATCHER' THEN 'DISPATCHER'::"user_role_new"
  WHEN 'OPERATIONS' THEN 'OPERATIONS'::"user_role_new"
  WHEN 'MAINTENANCE_MANAGER' THEN 'MAINTENANCE_MANAGER'::"user_role_new"
  ELSE NULL
END;

-- 4) Fail explicitly if any rows were not mapped
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE "role_new" IS NULL
  ) THEN
    RAISE EXCEPTION 'Unmapped values still exist in users.role';
  END IF;
END $$;

-- 5) Drop default first if any
ALTER TABLE "users"
ALTER COLUMN "role" DROP DEFAULT;

-- 6) Replace old column with new one
ALTER TABLE "users"
DROP COLUMN "role";

ALTER TABLE "users"
RENAME COLUMN "role_new" TO "role";

-- 7) Rename enum types safely
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'user_role'
  ) THEN
    ALTER TYPE "user_role" RENAME TO "user_role_old";
  END IF;
END $$;

ALTER TYPE "user_role_new" RENAME TO "user_role";

-- 8) Restore NOT NULL
ALTER TABLE "users"
ALTER COLUMN "role" SET NOT NULL;

-- 9) Drop old enum if it still exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'user_role_old'
  ) THEN
    DROP TYPE "user_role_old";
  END IF;
END $$;

-- ============================================
-- Add contract_id to trips
-- ============================================

ALTER TABLE "trips"
ADD COLUMN IF NOT EXISTS "contract_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trips_contract_id_fkey'
  ) THEN
    ALTER TABLE "trips"
    ADD CONSTRAINT "trips_contract_id_fkey"
    FOREIGN KEY ("contract_id")
    REFERENCES "client_contracts"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_trips_contract_id"
ON "trips"("contract_id");