-- CreateTable
CREATE TABLE "vehicle_classes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vehicle_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargo_types" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cargo_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_classes_company_id_idx" ON "vehicle_classes"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_classes_company_id_code_key" ON "vehicle_classes"("company_id", "code");

-- CreateIndex
CREATE INDEX "cargo_types_company_id_idx" ON "cargo_types"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "cargo_types_company_id_code_key" ON "cargo_types"("company_id", "code");

-- CreateIndex
CREATE INDEX "zones_company_id_idx" ON "zones"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "zones_company_id_code_key" ON "zones"("company_id", "code");

-- AddForeignKey
ALTER TABLE "vehicle_classes" ADD CONSTRAINT "vehicle_classes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargo_types" ADD CONSTRAINT "cargo_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
