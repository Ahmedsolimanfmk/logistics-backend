/*
  Warnings:

  - Added the required column `updated_at` to the `drivers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL;
