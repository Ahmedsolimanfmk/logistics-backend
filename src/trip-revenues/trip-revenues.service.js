const prisma = require("../prisma");

// =======================
// Helpers
// =======================
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getTripOrThrow(tripId) {
  const trip = await prisma.trips.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      client_id: true,
      agreed_revenue: true,
      revenue_currency: true,
      revenue_entry_mode: true,
      financial_status: true,
    },
  });

  if (!trip) {
    const err = new Error("Trip not found");
    err.statusCode = 404;
    throw err;
  }

  return trip;
}

// =======================
// Service
// =======================
async function getByTripId(tripId) {
  await getTripOrThrow(tripId);

  const row = await prisma.trip_revenues.findFirst({
    where: { trip_id: tripId },
    orderBy: { entered_at: "desc" },
    include: {
      users_entered: {
        select: { id: true, full_name: true, email: true, role: true },
      },
      users_approved: {
        select: { id: true, full_name: true, email: true, role: true },
      },
      clients: {
        select: { id: true, name: true },
      },
      client_contracts: {
        select: { id: true, contract_no: true, status: true },
      },
      ar_invoices: {
        select: { id: true, invoice_no: true, status: true, total_amount: true },
      },
    },
  });

  return row;
}

async function createOrUpdateRevenue({
  trip_id,
  amount,
  currency,
  source,
  contract_id,
  invoice_id,
  notes,
  entered_by,
}) {
  const trip = await getTripOrThrow(trip_id);

  const parsedAmount = toNumber(amount);
  if (parsedAmount === null || parsedAmount < 0) {
    const err = new Error("Valid amount is required");
    err.statusCode = 400;
    throw err;
  }

  const existing = await prisma.trip_revenues.findFirst({
    where: { trip_id },
    orderBy: { entered_at: "desc" },
    select: { id: true },
  });

  let row;

  if (existing) {
    row = await prisma.trip_revenues.update({
      where: { id: existing.id },
      data: {
        amount: parsedAmount,
        currency: currency || trip.revenue_currency || "EGP",
        source: source || "MANUAL",
        contract_id: contract_id || null,
        invoice_id: invoice_id || null,
        notes: notes || null,
      },
      include: {
        users_entered: {
          select: { id: true, full_name: true, email: true, role: true },
        },
        users_approved: {
          select: { id: true, full_name: true, email: true, role: true },
        },
        clients: {
          select: { id: true, name: true },
        },
        client_contracts: {
          select: { id: true, contract_no: true, status: true },
        },
        ar_invoices: {
          select: { id: true, invoice_no: true, status: true, total_amount: true },
        },
      },
    });
  } else {
    row = await prisma.trip_revenues.create({
      data: {
        trip_id,
        client_id: trip.client_id,
        contract_id: contract_id || null,
        invoice_id: invoice_id || null,
        amount: parsedAmount,
        currency: currency || trip.revenue_currency || "EGP",
        source: source || "MANUAL",
        entered_by: entered_by || null,
        notes: notes || null,
      },
      include: {
        users_entered: {
          select: { id: true, full_name: true, email: true, role: true },
        },
        users_approved: {
          select: { id: true, full_name: true, email: true, role: true },
        },
        clients: {
          select: { id: true, name: true },
        },
        client_contracts: {
          select: { id: true, contract_no: true, status: true },
        },
        ar_invoices: {
          select: { id: true, invoice_no: true, status: true, total_amount: true },
        },
      },
    });
  }

  await prisma.trips.update({
    where: { id: trip_id },
    data: {
      agreed_revenue: parsedAmount,
      revenue_currency: currency || trip.revenue_currency || "EGP",
      revenue_entry_mode: source === "CONTRACT" ? "CONTRACT" : "MANUAL",
    },
  });

  return row;
}

async function getTripProfitability(tripId) {
  const trip = await getTripOrThrow(tripId);

  const revenueRow = await prisma.trip_revenues.findFirst({
    where: { trip_id: tripId },
    orderBy: { entered_at: "desc" },
    select: {
      id: true,
      amount: true,
      currency: true,
      source: true,
      entered_at: true,
      approved_at: true,
      notes: true,
    },
  });

  const expensesAgg = await prisma.cash_expenses.aggregate({
    where: {
      trip_id: tripId,
    },
    _sum: {
      amount: true,
    },
  });

  const advancesAgg = await prisma.cash_expenses.aggregate({
    where: {
      trip_id: tripId,
      payment_source: "ADVANCE",
    },
    _sum: {
      amount: true,
    },
  });

  const revenue = revenueRow?.amount ? Number(revenueRow.amount) : Number(trip.agreed_revenue || 0);
  const expenses = expensesAgg?._sum?.amount ? Number(expensesAgg._sum.amount) : 0;
  const advances = advancesAgg?._sum?.amount ? Number(advancesAgg._sum.amount) : 0;
  const profit = revenue - expenses;

  return {
    trip_id: tripId,
    financial_status: trip.financial_status,
    revenue,
    expenses,
    advances,
    profit,
    currency: revenueRow?.currency || trip.revenue_currency || "EGP",
    revenue_record: revenueRow || null,
  };
}

module.exports = {
  getByTripId,
  createOrUpdateRevenue,
  getTripProfitability,
};