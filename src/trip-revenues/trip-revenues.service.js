const prisma = require("../prisma");
const tripFinanceService = require("../trips/trip-finance.service");

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

  const normalizedSource = String(source || "MANUAL").toUpperCase();
  const resolvedCurrency = currency || trip.revenue_currency || "EGP";

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
        currency: resolvedCurrency,
        source: normalizedSource,
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
        currency: resolvedCurrency,
        source: normalizedSource,
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
      revenue_currency: resolvedCurrency,
      revenue_entry_mode: normalizedSource === "CONTRACT" ? "CONTRACT" : "MANUAL",
    },
  });

  return row;
}

async function getTripProfitability(tripId) {
  return tripFinanceService.getTripFinanceSummary(tripId);
}

module.exports = {
  getByTripId,
  createOrUpdateRevenue,
  getTripProfitability,
};