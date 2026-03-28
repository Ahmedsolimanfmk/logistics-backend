/*
  Warnings:

  - You are about to drop the column `companiesId` on the `inventory_issue_lines` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "inventory_issue_lines" DROP CONSTRAINT "inventory_issue_lines_companiesId_fkey";

-- AlterTable
ALTER TABLE "inventory_issue_lines" DROP COLUMN "companiesId",
ADD COLUMN     "company_id" UUID;

-- CreateIndex
CREATE INDEX "idx_inventory_issue_lines_company_id" ON "inventory_issue_lines"("company_id");

-- AddForeignKey
ALTER TABLE "inventory_issue_lines" ADD CONSTRAINT "inventory_issue_lines_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
