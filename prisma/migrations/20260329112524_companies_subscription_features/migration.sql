/*
  Warnings:

  - You are about to drop the column `left_at` on the `company_users` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "company_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE', 'ARCHIVED');

-- DropIndex
DROP INDEX "company_users_user_id_idx";

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "status" "company_status" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "company_subscriptions" ADD COLUMN     "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "grace_ends_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "company_users" DROP COLUMN "left_at",
ADD COLUMN     "deactivated_at" TIMESTAMP(3),
ADD COLUMN     "invited_at" TIMESTAMP(3),
ADD COLUMN     "invited_by" TEXT;

-- CreateIndex
CREATE INDEX "company_users_user_id_status_is_active_idx" ON "company_users"("user_id", "status", "is_active");
