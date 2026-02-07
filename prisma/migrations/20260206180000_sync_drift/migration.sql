-- 1) maintenance_work_orders.request_id (safe)
ALTER TABLE "public"."maintenance_work_orders"
ADD COLUMN IF NOT EXISTS "request_id" uuid;

-- 2) index on request_id (safe)
CREATE INDEX IF NOT EXISTS "idx_mwo_request_id"
ON "public"."maintenance_work_orders" ("request_id");

-- 3) FK request_id -> maintenance_requests.id (safe)
DO $$
DECLARE
  att smallint;
BEGIN
  SELECT attnum INTO att
  FROM pg_attribute
  WHERE attrelid = 'public.maintenance_work_orders'::regclass
    AND attname  = 'request_id'
    AND NOT attisdropped;

  IF att IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.maintenance_work_orders'::regclass
      AND c.contype  = 'f'
      AND c.confrelid = 'public.maintenance_requests'::regclass
      AND c.conkey = ARRAY[att]
  ) THEN
    ALTER TABLE "public"."maintenance_work_orders"
      ADD CONSTRAINT "maintenance_work_orders_request_id_fkey"
      FOREIGN KEY ("request_id")
      REFERENCES "public"."maintenance_requests"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;

-- 4) index on trips.created_at (safe)
CREATE INDEX IF NOT EXISTS "idx_trips_created_at"
ON "public"."trips" ("created_at");
