-- CreateTable
CREATE TABLE "inventory_request_reservations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "request_id" UUID NOT NULL,
    "part_item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_request_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_req_res_request_id" ON "inventory_request_reservations"("request_id");

-- CreateIndex
CREATE INDEX "idx_req_res_part_item_id" ON "inventory_request_reservations"("part_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_req_res_request_part_item" ON "inventory_request_reservations"("request_id", "part_item_id");

-- AddForeignKey
ALTER TABLE "inventory_request_reservations" ADD CONSTRAINT "inventory_request_reservations_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "inventory_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_request_reservations" ADD CONSTRAINT "inventory_request_reservations_part_item_id_fkey" FOREIGN KEY ("part_item_id") REFERENCES "part_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
