-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "supervisor_id" UUID;

-- CreateIndex
CREATE INDEX "idx_vehicles_supervisor_id" ON "vehicles"("supervisor_id");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
