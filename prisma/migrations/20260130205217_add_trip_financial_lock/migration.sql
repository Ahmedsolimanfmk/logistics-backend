-- ✅ SAFE ADD plate_number (table has existing rows)
ALTER TABLE "vehicles" ADD COLUMN IF NOT EXISTS "plate_number" TEXT;

-- ✅ Fill existing rows (1 row عندك) بقيمة مؤقتة Unique
UPDATE "vehicles"
SET "plate_number" = CONCAT('TEMP-', "id")
WHERE "plate_number" IS NULL;

-- ✅ Now enforce NOT NULL
ALTER TABLE "vehicles" ALTER COLUMN "plate_number" SET NOT NULL;

-- ✅ Add unique constraint / unique index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vehicles_plate_number_key'
  ) THEN
    ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_plate_number_key" UNIQUE ("plate_number");
  END IF;
END $$;
