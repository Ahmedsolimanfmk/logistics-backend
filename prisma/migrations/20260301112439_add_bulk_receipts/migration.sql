-- CreateTable
CREATE TABLE "warehouse_parts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "warehouse_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "qty_on_hand" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_receipt_bulk_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "receipt_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2),
    "total_cost" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_receipt_bulk_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_warehouse_parts_warehouse_id" ON "warehouse_parts"("warehouse_id");

-- CreateIndex
CREATE INDEX "idx_warehouse_parts_part_id" ON "warehouse_parts"("part_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_warehouse_parts_warehouse_part" ON "warehouse_parts"("warehouse_id", "part_id");

-- CreateIndex
CREATE INDEX "idx_receipt_bulk_lines_receipt_id" ON "inventory_receipt_bulk_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "idx_receipt_bulk_lines_part_id" ON "inventory_receipt_bulk_lines"("part_id");

-- AddForeignKey
ALTER TABLE "warehouse_parts" ADD CONSTRAINT "warehouse_parts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_parts" ADD CONSTRAINT "warehouse_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipt_bulk_lines" ADD CONSTRAINT "inventory_receipt_bulk_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "inventory_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipt_bulk_lines" ADD CONSTRAINT "inventory_receipt_bulk_lines_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
