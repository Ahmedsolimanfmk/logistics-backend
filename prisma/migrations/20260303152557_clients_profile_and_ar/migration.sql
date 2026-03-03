-- CreateEnum
CREATE TYPE "contract_billing_cycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_OFF');

-- CreateEnum
CREATE TYPE "contract_status" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "ar_invoice_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ar_payment_status" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ar_payment_method" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'OTHER');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_name" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "hq_address" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "tax_no" TEXT;

-- CreateTable
CREATE TABLE "client_contracts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "client_id" UUID NOT NULL,
    "contract_no" TEXT,
    "start_date" TIMESTAMPTZ(6) NOT NULL,
    "end_date" TIMESTAMPTZ(6),
    "billing_cycle" "contract_billing_cycle" NOT NULL DEFAULT 'MONTHLY',
    "contract_value" DECIMAL(12,2),
    "currency" TEXT DEFAULT 'EGP',
    "status" "contract_status" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_invoices" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "client_id" UUID NOT NULL,
    "contract_id" UUID,
    "invoice_no" TEXT NOT NULL,
    "issue_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMPTZ(6),
    "amount" DECIMAL(12,2) NOT NULL,
    "vat_amount" DECIMAL(12,2),
    "total_amount" DECIMAL(12,2) NOT NULL,
    "status" "ar_invoice_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "notes" TEXT,
    "source_trip_id" UUID,

    CONSTRAINT "ar_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_payments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "client_id" UUID NOT NULL,
    "payment_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "ar_payment_method" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "notes" TEXT,
    "status" "ar_payment_status" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,

    CONSTRAINT "ar_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_payment_allocations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_allocated" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ar_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_client_contracts_client_id" ON "client_contracts"("client_id");

-- CreateIndex
CREATE INDEX "idx_client_contracts_status" ON "client_contracts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ar_invoices_invoice_no_key" ON "ar_invoices"("invoice_no");

-- CreateIndex
CREATE INDEX "idx_ar_invoices_client_id" ON "ar_invoices"("client_id");

-- CreateIndex
CREATE INDEX "idx_ar_invoices_status" ON "ar_invoices"("status");

-- CreateIndex
CREATE INDEX "idx_ar_invoices_issue_date" ON "ar_invoices"("issue_date");

-- CreateIndex
CREATE INDEX "idx_ar_invoices_due_date" ON "ar_invoices"("due_date");

-- CreateIndex
CREATE INDEX "idx_ar_payments_client_id" ON "ar_payments"("client_id");

-- CreateIndex
CREATE INDEX "idx_ar_payments_status" ON "ar_payments"("status");

-- CreateIndex
CREATE INDEX "idx_ar_payments_payment_date" ON "ar_payments"("payment_date");

-- CreateIndex
CREATE INDEX "idx_ar_alloc_payment_id" ON "ar_payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "idx_ar_alloc_invoice_id" ON "ar_payment_allocations"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_ar_alloc_payment_invoice" ON "ar_payment_allocations"("payment_id", "invoice_id");

-- CreateIndex
CREATE INDEX "idx_clients_name" ON "clients"("name");

-- AddForeignKey
ALTER TABLE "client_contracts" ADD CONSTRAINT "client_contracts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "client_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_payment_allocations" ADD CONSTRAINT "ar_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "ar_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_payment_allocations" ADD CONSTRAINT "ar_payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ar_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
