/*
  Warnings:

  - You are about to drop the column `supervisor_id` on the `vehicles` table. All the data in the column will be lost.
  - You are about to drop the `vehicle_portfolio` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "supervisor_scope" AS ENUM ('DEPARTMENT', 'FLEET', 'SITE', 'FLEET_SITE');

-- DropForeignKey
ALTER TABLE "vehicle_portfolio" DROP CONSTRAINT "vehicle_portfolio_field_supervisor_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicle_portfolio" DROP CONSTRAINT "vehicle_portfolio_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_supervisor_id_fkey";

-- DropIndex
DROP INDEX "idx_vehicles_supervisor_id";

-- AlterTable
ALTER TABLE "vehicles" DROP COLUMN "supervisor_id";

-- DropTable
DROP TABLE "vehicle_portfolio";

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "department_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_vehicles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "fleet_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleet_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_site_assignments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "fleet_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fleet_site_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_assignments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "supervisor_id" UUID NOT NULL,
    "department_id" UUID,
    "fleet_id" UUID,
    "site_id" UUID,
    "role_scope" "supervisor_scope" NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supervisor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "idx_departments_is_active" ON "departments"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "fleets_code_key" ON "fleets"("code");

-- CreateIndex
CREATE INDEX "idx_fleets_department_id" ON "fleets"("department_id");

-- CreateIndex
CREATE INDEX "idx_fleets_is_active" ON "fleets"("is_active");

-- CreateIndex
CREATE INDEX "idx_fleet_vehicles_fleet_id" ON "fleet_vehicles"("fleet_id");

-- CreateIndex
CREATE INDEX "idx_fleet_vehicles_vehicle_id" ON "fleet_vehicles"("vehicle_id");

-- CreateIndex
CREATE INDEX "idx_fleet_vehicles_is_active" ON "fleet_vehicles"("is_active");

-- CreateIndex
CREATE INDEX "idx_fleet_site_assignments_fleet_id" ON "fleet_site_assignments"("fleet_id");

-- CreateIndex
CREATE INDEX "idx_fleet_site_assignments_site_id" ON "fleet_site_assignments"("site_id");

-- CreateIndex
CREATE INDEX "idx_fleet_site_assignments_is_active" ON "fleet_site_assignments"("is_active");

-- CreateIndex
CREATE INDEX "idx_supervisor_assignments_supervisor_id" ON "supervisor_assignments"("supervisor_id");

-- CreateIndex
CREATE INDEX "idx_supervisor_assignments_department_id" ON "supervisor_assignments"("department_id");

-- CreateIndex
CREATE INDEX "idx_supervisor_assignments_fleet_id" ON "supervisor_assignments"("fleet_id");

-- CreateIndex
CREATE INDEX "idx_supervisor_assignments_site_id" ON "supervisor_assignments"("site_id");

-- CreateIndex
CREATE INDEX "idx_supervisor_assignments_is_active" ON "supervisor_assignments"("is_active");

-- AddForeignKey
ALTER TABLE "fleets" ADD CONSTRAINT "fleets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_fleet_id_fkey" FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_vehicles" ADD CONSTRAINT "fleet_vehicles_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_site_assignments" ADD CONSTRAINT "fleet_site_assignments_fleet_id_fkey" FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_site_assignments" ADD CONSTRAINT "fleet_site_assignments_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_fleet_id_fkey" FOREIGN KEY ("fleet_id") REFERENCES "fleets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
