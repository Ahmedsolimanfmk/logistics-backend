/*
  Warnings:

  - A unique constraint covering the columns `[phone2]` on the table `drivers` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "alert_reads" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "alert_key" VARCHAR(191) NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_alert_reads_user_id" ON "alert_reads"("user_id");

-- CreateIndex
CREATE INDEX "idx_alert_reads_alert_key" ON "alert_reads"("alert_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_alert_reads_alert_key_user_id" ON "alert_reads"("alert_key", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_phone2_key" ON "drivers"("phone2");
