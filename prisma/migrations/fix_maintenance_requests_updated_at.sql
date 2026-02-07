ALTER TABLE "maintenance_requests"
ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();
