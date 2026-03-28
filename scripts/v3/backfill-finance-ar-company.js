require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== BACKFILL FINANCE AR COMPANY START ===");

  const cashAdvances = await prisma.cash_advances.findMany({
    select: { id: true, company_id: true, field_supervisor_id: true, issued_by: true },
  });
  let cashAdvancesUpdated = 0;
  for (const row of cashAdvances) {
    if (row.company_id) continue;
    const supervisorMembership = await prisma.company_users.findFirst({ where: { user_id: row.field_supervisor_id, is_active: true, status: "ACTIVE" }, select: { company_id: true } });
    const issuerMembership = await prisma.company_users.findFirst({ where: { user_id: row.issued_by, is_active: true, status: "ACTIVE" }, select: { company_id: true } });
    if (!supervisorMembership?.company_id || !issuerMembership?.company_id || supervisorMembership.company_id !== issuerMembership.company_id) {
      throw new Error(`Company mismatch in cash_advance ${row.id}`);
    }
    await prisma.cash_advances.update({ where: { id: row.id }, data: { company_id: supervisorMembership.company_id } });
    cashAdvancesUpdated++;
  }

  const cashExpenses = await prisma.cash_expenses.findMany({
    select: {
      id: true,
      company_id: true,
      cash_advance_id: true,
      trip_id: true,
      vehicle_id: true,
      maintenance_work_order_id: true,
      inventory_receipt_id: true,
      vendor_id: true,
    },
  });
  let cashExpensesUpdated = 0;
  for (const row of cashExpenses) {
    if (row.company_id) continue;

    let derivedCompanyId = null;

    if (row.cash_advance_id) {
      const x = await prisma.cash_advances.findUnique({ where: { id: row.cash_advance_id }, select: { company_id: true } });
      derivedCompanyId = x?.company_id ?? derivedCompanyId;
    }
    if (!derivedCompanyId && row.trip_id) {
      const x = await prisma.trips.findUnique({ where: { id: row.trip_id }, select: { company_id: true } });
      derivedCompanyId = x?.company_id ?? derivedCompanyId;
    }
    if (!derivedCompanyId && row.vehicle_id) {
      const x = await prisma.vehicles.findUnique({ where: { id: row.vehicle_id }, select: { company_id: true } });
      derivedCompanyId = x?.company_id ?? derivedCompanyId;
    }
    if (!derivedCompanyId && row.maintenance_work_order_id) {
      const x = await prisma.maintenance_work_orders.findUnique({ where: { id: row.maintenance_work_order_id }, select: { company_id: true } });
      derivedCompanyId = x?.company_id ?? derivedCompanyId;
    }
    if (!derivedCompanyId && row.inventory_receipt_id) {
      const x = await prisma.inventory_receipts.findUnique({ where: { id: row.inventory_receipt_id }, select: { company_id: true } });
      derivedCompanyId = x?.company_id ?? derivedCompanyId;
    }
    if (!derivedCompanyId && row.vendor_id) {
      const x = await prisma.vendors.findUnique({ where: { id: row.vendor_id }, select: { company_id: true } });
      derivedCompanyId = x?.company_id ?? derivedCompanyId;
    }

    if (!derivedCompanyId) throw new Error(`Could not derive company_id for cash_expense ${row.id}`);

    await prisma.cash_expenses.update({ where: { id: row.id }, data: { company_id: derivedCompanyId } });
    cashExpensesUpdated++;
  }

  const audits = await prisma.cash_expense_audits.findMany({
    select: { id: true, company_id: true, expense_id: true },
  });
  let auditsUpdated = 0;
  for (const row of audits) {
    if (row.company_id) continue;
    const expense = await prisma.cash_expenses.findUnique({ where: { id: row.expense_id }, select: { company_id: true } });
    if (!expense?.company_id) throw new Error(`Expense ${row.expense_id} has no company_id`);
    await prisma.cash_expense_audits.update({ where: { id: row.id }, data: { company_id: expense.company_id } });
    auditsUpdated++;
  }

  const vendorTxs = await prisma.vendor_transactions.findMany({
    select: {
      id: true,
      company_id: true,
      vendor_id: true,
      related_cash_expense_id: true,
      related_work_order_id: true,
      related_inventory_receipt_id: true,
    },
  });
  let vendorTxsUpdated = 0;
  for (const row of vendorTxs) {
    if (row.company_id) continue;
    const vendor = await prisma.vendors.findUnique({ where: { id: row.vendor_id }, select: { company_id: true } });
    if (!vendor?.company_id) throw new Error(`Vendor ${row.vendor_id} has no company_id`);
    await prisma.vendor_transactions.update({ where: { id: row.id }, data: { company_id: vendor.company_id } });
    vendorTxsUpdated++;
  }

  const invoices = await prisma.ar_invoices.findMany({
    select: { id: true, company_id: true, client_id: true },
  });
  let invoicesUpdated = 0;
  for (const row of invoices) {
    if (row.company_id) continue;
    const client = await prisma.clients.findUnique({ where: { id: row.client_id }, select: { company_id: true } });
    if (!client?.company_id) throw new Error(`Client ${row.client_id} has no company_id`);
    await prisma.ar_invoices.update({ where: { id: row.id }, data: { company_id: client.company_id } });
    invoicesUpdated++;
  }

  const payments = await prisma.ar_payments.findMany({
    select: { id: true, company_id: true, client_id: true },
  });
  let paymentsUpdated = 0;
  for (const row of payments) {
    if (row.company_id) continue;
    const client = await prisma.clients.findUnique({ where: { id: row.client_id }, select: { company_id: true } });
    if (!client?.company_id) throw new Error(`Client ${row.client_id} has no company_id`);
    await prisma.ar_payments.update({ where: { id: row.id }, data: { company_id: client.company_id } });
    paymentsUpdated++;
  }

  const allocations = await prisma.ar_payment_allocations.findMany({
    select: { id: true, company_id: true, payment_id: true, invoice_id: true },
  });
  let allocationsUpdated = 0;
  for (const row of allocations) {
    if (row.company_id) continue;
    const payment = await prisma.ar_payments.findUnique({ where: { id: row.payment_id }, select: { company_id: true } });
    const invoice = await prisma.ar_invoices.findUnique({ where: { id: row.invoice_id }, select: { company_id: true } });
    if (!payment?.company_id || !invoice?.company_id || payment.company_id !== invoice.company_id) {
      throw new Error(`Company mismatch in ar_payment_allocation ${row.id}`);
    }
    await prisma.ar_payment_allocations.update({ where: { id: row.id }, data: { company_id: payment.company_id } });
    allocationsUpdated++;
  }

  const invoiceTripLines = await prisma.ar_invoice_trip_lines.findMany({
    select: { id: true, company_id: true, invoice_id: true, trip_id: true },
  });
  let invoiceTripLinesUpdated = 0;
  for (const row of invoiceTripLines) {
    if (row.company_id) continue;
    const invoice = await prisma.ar_invoices.findUnique({ where: { id: row.invoice_id }, select: { company_id: true } });
    const trip = await prisma.trips.findUnique({ where: { id: row.trip_id }, select: { company_id: true } });
    if (!invoice?.company_id || !trip?.company_id || invoice.company_id !== trip.company_id) {
      throw new Error(`Company mismatch in ar_invoice_trip_line ${row.id}`);
    }
    await prisma.ar_invoice_trip_lines.update({ where: { id: row.id }, data: { company_id: invoice.company_id } });
    invoiceTripLinesUpdated++;
  }

  console.log("Cash advances updated:", cashAdvancesUpdated);
  console.log("Cash expenses updated:", cashExpensesUpdated);
  console.log("Cash expense audits updated:", auditsUpdated);
  console.log("Vendor transactions updated:", vendorTxsUpdated);
  console.log("AR invoices updated:", invoicesUpdated);
  console.log("AR payments updated:", paymentsUpdated);
  console.log("AR payment allocations updated:", allocationsUpdated);
  console.log("AR invoice trip lines updated:", invoiceTripLinesUpdated);
  console.log("=== BACKFILL FINANCE AR COMPANY END ===");
}

main()
  .catch((error) => {
    console.error("BACKFILL FINANCE AR COMPANY FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });