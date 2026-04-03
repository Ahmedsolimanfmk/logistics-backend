-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "zone_id" UUID;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
