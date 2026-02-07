-- ASC index
CREATE INDEX IF NOT EXISTS "trips_created_at_idx"
ON "public"."trips" USING btree ("created_at");

-- DESC index (as in DB)
CREATE INDEX IF NOT EXISTS "idx_trips_created_at"
ON "public"."trips" USING btree ("created_at" DESC);
