-- 20260205140000_maintenance_attachments
-- Create enum (safe)
DO $$ BEGIN
  CREATE TYPE "maintenance_attachment_type" AS ENUM ('IMAGE','VIDEO','OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create table (safe)
CREATE TABLE IF NOT EXISTS "maintenance_request_attachments" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "request_id" UUID NOT NULL,
  "type" "maintenance_attachment_type" NOT NULL DEFAULT 'OTHER',
  "original_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "storage_path" TEXT NOT NULL,
  "uploaded_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "maintenance_request_attachments_pkey" PRIMARY KEY ("id")
);

-- Index (safe)
CREATE INDEX IF NOT EXISTS "maintenance_request_attachments_request_id_idx"
ON "maintenance_request_attachments"("request_id");

-- FK (safe)
DO $$ BEGIN
  ALTER TABLE "maintenance_request_attachments"
  ADD CONSTRAINT "maintenance_request_attachments_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "maintenance_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
