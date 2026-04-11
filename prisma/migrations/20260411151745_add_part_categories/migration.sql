-- AlterTable
ALTER TABLE "parts" ADD COLUMN     "category_id" UUID;

-- CreateTable
CREATE TABLE "part_categories" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_part_categories_company_id" ON "part_categories"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_part_categories_company_name" ON "part_categories"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_part_categories_company_code" ON "part_categories"("company_id", "code");

-- CreateIndex
CREATE INDEX "idx_parts_category_id" ON "parts"("category_id");

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "part_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_categories" ADD CONSTRAINT "part_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
