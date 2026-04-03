-- CreateTable
CREATE TABLE "contract_pricing_rules" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "route_id" UUID,
    "pickup_site_id" UUID,
    "dropoff_site_id" UUID,
    "from_zone_id" UUID,
    "to_zone_id" UUID,
    "vehicle_class_id" UUID,
    "cargo_type_id" UUID,
    "trip_type" TEXT,
    "min_weight" DECIMAL(12,2),
    "max_weight" DECIMAL(12,2),
    "base_price" DECIMAL(12,2) NOT NULL,
    "currency" TEXT DEFAULT 'EGP',
    "price_per_ton" DECIMAL(12,2),
    "price_per_km" DECIMAL(12,2),
    "priority" INTEGER DEFAULT 100,
    "effective_from" TIMESTAMPTZ(6),
    "effective_to" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contract_pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "client_id" UUID,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "pickup_site_id" UUID,
    "dropoff_site_id" UUID,
    "origin_label" TEXT,
    "destination_label" TEXT,
    "distance_km" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_pricing_rules_company_id_idx" ON "contract_pricing_rules"("company_id");

-- CreateIndex
CREATE INDEX "contract_pricing_rules_client_id_idx" ON "contract_pricing_rules"("client_id");

-- CreateIndex
CREATE INDEX "contract_pricing_rules_contract_id_idx" ON "contract_pricing_rules"("contract_id");

-- CreateIndex
CREATE INDEX "contract_pricing_rules_route_id_idx" ON "contract_pricing_rules"("route_id");

-- CreateIndex
CREATE INDEX "contract_pricing_rules_vehicle_class_id_idx" ON "contract_pricing_rules"("vehicle_class_id");

-- CreateIndex
CREATE INDEX "contract_pricing_rules_cargo_type_id_idx" ON "contract_pricing_rules"("cargo_type_id");

-- CreateIndex
CREATE INDEX "contract_pricing_rules_pickup_site_id_idx" ON "contract_pricing_rules"("pickup_site_id");

-- CreateIndex
CREATE INDEX "contract_pricing_rules_dropoff_site_id_idx" ON "contract_pricing_rules"("dropoff_site_id");

-- CreateIndex
CREATE INDEX "contract_pricing_rules_from_zone_id_idx" ON "contract_pricing_rules"("from_zone_id");

-- CreateIndex
CREATE INDEX "contract_pricing_rules_to_zone_id_idx" ON "contract_pricing_rules"("to_zone_id");

-- CreateIndex
CREATE INDEX "routes_company_id_idx" ON "routes"("company_id");

-- CreateIndex
CREATE INDEX "routes_client_id_idx" ON "routes"("client_id");

-- CreateIndex
CREATE INDEX "routes_pickup_site_id_idx" ON "routes"("pickup_site_id");

-- CreateIndex
CREATE INDEX "routes_dropoff_site_id_idx" ON "routes"("dropoff_site_id");

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "client_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_pickup_site_id_fkey" FOREIGN KEY ("pickup_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_dropoff_site_id_fkey" FOREIGN KEY ("dropoff_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_from_zone_id_fkey" FOREIGN KEY ("from_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_to_zone_id_fkey" FOREIGN KEY ("to_zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_vehicle_class_id_fkey" FOREIGN KEY ("vehicle_class_id") REFERENCES "vehicle_classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_pricing_rules" ADD CONSTRAINT "contract_pricing_rules_cargo_type_id_fkey" FOREIGN KEY ("cargo_type_id") REFERENCES "cargo_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_pickup_site_id_fkey" FOREIGN KEY ("pickup_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_dropoff_site_id_fkey" FOREIGN KEY ("dropoff_site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
