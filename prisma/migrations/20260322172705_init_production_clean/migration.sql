-- 1) Create enum
CREATE TYPE "cash_expense_type" AS ENUM (
  'FUEL',
  'TOLL',
  'MAINTENANCE',
  'DRIVER_ALLOWANCE',
  'LOADING',
  'UNLOADING',
  'PARTS_PURCHASE',
  'EMERGENCY',
  'OTHER'
);

-- 2) Normalize existing values before casting
UPDATE "cash_expenses"
SET "expense_type" = CASE
  WHEN UPPER(TRIM("expense_type")) IN ('FUEL', 'SOLAR') THEN 'FUEL'
  WHEN UPPER(TRIM("expense_type")) IN ('TOLL', 'ROAD_TOLL') THEN 'TOLL'
  WHEN UPPER(TRIM("expense_type")) IN ('MAINTENANCE', 'REPAIR') THEN 'MAINTENANCE'
  WHEN UPPER(TRIM("expense_type")) IN ('DRIVER_ALLOWANCE', 'ALLOWANCE') THEN 'DRIVER_ALLOWANCE'
  WHEN UPPER(TRIM("expense_type")) IN ('LOADING') THEN 'LOADING'
  WHEN UPPER(TRIM("expense_type")) IN ('UNLOADING') THEN 'UNLOADING'
  WHEN UPPER(TRIM("expense_type")) IN ('PARTS_PURCHASE', 'PARTS') THEN 'PARTS_PURCHASE'
  WHEN UPPER(TRIM("expense_type")) IN ('EMERGENCY') THEN 'EMERGENCY'
  ELSE 'OTHER'
END
WHERE "expense_type" IS NOT NULL;

-- 3) Alter column type using cast
ALTER TABLE "cash_expenses"
ALTER COLUMN "expense_type" TYPE "cash_expense_type"
USING ("expense_type"::"cash_expense_type");
-- 1) Add as nullable first
ALTER TABLE "trips"
ADD COLUMN "trip_code" TEXT;

-- 2) Backfill existing rows
UPDATE "trips"
SET "trip_code" = 'TRIP-' || SUBSTRING(REPLACE(CAST("id" AS TEXT), '-', '') FROM 1 FOR 8)
WHERE "trip_code" IS NULL;

-- 3) Make it required
ALTER TABLE "trips"
ALTER COLUMN "trip_code" SET NOT NULL;

-- 4) Add unique index
CREATE UNIQUE INDEX "trips_trip_code_key" ON "trips"("trip_code");