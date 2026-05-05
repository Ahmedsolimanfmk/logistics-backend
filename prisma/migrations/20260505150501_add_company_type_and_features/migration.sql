-- CreateEnum
CREATE TYPE "company_type" AS ENUM ('DIRECT_TRANSPORT', 'CONTRACTOR');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "company_type" "company_type" NOT NULL DEFAULT 'DIRECT_TRANSPORT';

-- AlterTable
ALTER TABLE "company_users" ADD COLUMN     "company_type" "company_type" NOT NULL DEFAULT 'DIRECT_TRANSPORT';

-- CreateTable
CREATE TABLE "company_features" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "fleet_enabled" BOOLEAN NOT NULL DEFAULT true,
    "inventory_enabled" BOOLEAN NOT NULL DEFAULT true,
    "custody_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_features_company_id_key" ON "company_features"("company_id");

-- AddForeignKey
ALTER TABLE "company_features" ADD CONSTRAINT "company_features_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
