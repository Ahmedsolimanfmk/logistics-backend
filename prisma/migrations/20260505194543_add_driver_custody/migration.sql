-- CreateEnum
CREATE TYPE "driver_custody_type" AS ENUM ('CASH_RECEIVED', 'TRANSFER', 'DELIVERY_PROOF');

-- CreateTable
CREATE TABLE "driver_custody" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "trip_id" UUID,
    "driver_id" UUID NOT NULL,
    "type" "driver_custody_type" NOT NULL,
    "amount" DOUBLE PRECISION,
    "reference" TEXT,
    "attachment_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_custody_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "driver_custody" ADD CONSTRAINT "driver_custody_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_custody" ADD CONSTRAINT "driver_custody_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_custody" ADD CONSTRAINT "driver_custody_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
