const prisma = require("../prisma");
const tripFinanceService = require("../trips/trip-finance.service");
const contractPricingService = require("../contract-pricing/contract-pricing.service");

// =======================
// Helpers
// =======================
function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function buildBadRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function buildNotFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function buildConflict(message) {
  const err = new Error(message);
  err.statusCode = 409;
  return err;
}

async function getTripOrThrow(tripId, companyId) {
  const trip = await prisma.trips.findFirst({
    where: {
      id: tripId,
      company_id: companyId,
    },
    select: {
      id: true,
      company_id: true,
      client_id: true,
      contract_id: true,
      site_id: true,

      agreed_revenue: true,
      revenue_currency: true,
      revenue_entry_mode: true,
      financial_status: true,

      trip_type: true,
      cargo_type: true,
      cargo_weight: true,
      origin: true,
      destination: true,

      contract: {
        select: {
          id: true,
          client_id: true,
          contract_no: true,
          status: true,
          currency: true,
          end_date: true,
        },
      },

      site: {
        select: {
          id: true,
          company_id: true,
          client_id: true,
          name: true,
          zone_id: true,
        },
      },

      trip_assignments: {
        where: {
          company_id: companyId,
          is_active: true,
        },
        take: 1,
        select: {
          vehicle_id: true,
          vehicle: {
            select: {
              id: true,
              company_id: true,
              vehicle_class_id: true,
            },
          },
        },
      },
    },
  });

  if (!trip) {
    throw buildNotFound("Trip not found");
  }

  const activeAssignment = trip.trip_assignments?.[0] || null;

  return {
    ...trip,

    // Compatibility aliases for pricing resolver / old code paths
    client_contracts: trip.contract || null,
    pickup_site: trip.site || null,
    dropoff_site: null,
    routes: null,

    route_id: null,
    pickup_site_id: trip.site_id || null,
    dropoff_site_id: null,
    cargo_type_id: null,

    pickup_zone_id: trip.site?.zone_id || null,
    dropoff_zone_id: null,
    vehicle_class_id: activeAssignment?.vehicle?.vehicle_class_id || null,
    route_distance_km: null,
  };
}

function validateSource(source) {
  const normalized = upper(source || "MANUAL");
  const allowed = ["MANUAL", "CONTRACT", "INVOICE"];

  if (!allowed.includes(normalized)) {
    throw buildBadRequest(
      `Invalid revenue source. Allowed values: ${allowed.join(", ")}`
    );
  }

  return normalized;
}

async function validateContractForTrip({ trip, companyId, contract_id }) {
  if (!contract_id) return null;

  const contract = await prisma.client_contracts.findFirst({
    where: {
      id: contract_id,
      company_id: companyId,
    },
    select: {
      id: true,
      company_id: true,
      client_id: true,
      status: true,
      contract_no: true,
      currency: true,
      end_date: true,
    },
  });

  if (!contract) {
    throw buildNotFound("Contract not found");
  }

  if (contract.client_id !== trip.client_id) {
    throw buildBadRequest("contract_id does not belong to the trip client");
  }

  if (trip.contract_id && trip.contract_id !== contract.id) {
    throw buildBadRequest("contract_id does not match trip contract_id");
  }

  return contract;
}

async function validateInvoiceForTrip({
  trip,
  companyId,
  invoice_id,
  contract_id = null,
}) {
  if (!invoice_id) return null;

  const invoice = await prisma.ar_invoices.findFirst({
    where: {
      id: invoice_id,
      company_id: companyId,
    },
    select: {
      id: true,
      company_id: true,
      client_id: true,
      contract_id: true,
      invoice_no: true,
      status: true,
      total_amount: true,
    },
  });

  if (!invoice) {
    throw buildNotFound("Invoice not found");
  }

  if (invoice.client_id !== trip.client_id) {
    throw buildBadRequest("invoice_id does not belong to the trip client");
  }

  if (contract_id && invoice.contract_id && invoice.contract_id !== contract_id) {
    throw buildBadRequest("invoice_id does not belong to the selected contract");
  }

  if (
    trip.contract_id &&
    invoice.contract_id &&
    invoice.contract_id !== trip.contract_id
  ) {
    throw buildBadRequest("invoice contract does not match trip contract_id");
  }

  return invoice;
}

function pickRevenueEntryMode(source) {
  if (source === "CONTRACT") return "CONTRACT";
  return "MANUAL";
}

function includeRevenueRelations() {
  return {
    entered_by_user: {
      select: { id: true, full_name: true, email: true, role: true },
    },
    approved_by_user: {
      select: { id: true, full_name: true, email: true, role: true },
    },
    client: {
      select: { id: true, name: true },
    },
    contract: {
      select: { id: true, contract_no: true, status: true, currency: true },
    },
    invoice: {
      select: { id: true, invoice_no: true, status: true, total_amount: true },
    },
  };
}

function getRevenueAmountFromResolver(resolver) {
  return (
    resolver?.resolved_rule?.resolved_amount ??
    resolver?.resolved_rule?.amount ??
    resolver?.amount ??
    null
  );
}

function getRevenueCurrencyFromResolver(resolver, fallback = "EGP") {
  return (
    resolver?.resolved_rule?.resolved_currency ||
    resolver?.resolved_rule?.currency ||
    resolver?.currency ||
    fallback
  );
}

// =======================
// Queries
// =======================
async function getByTripId(tripId, companyId) {
  await getTripOrThrow(tripId, companyId);

  const row = await prisma.trip_revenues.findFirst({
    where: {
      trip_id: tripId,
      company_id: companyId,
    },
    orderBy: [{ entered_at: "desc" }],
    include: includeRevenueRelations(),
  });

  return row;
}

async function getRevenueHistoryByTripId(tripId, companyId) {
  await getTripOrThrow(tripId, companyId);

  return prisma.trip_revenues.findMany({
    where: {
      trip_id: tripId,
      company_id: companyId,
    },
    orderBy: [{ entered_at: "desc" }],
    include: includeRevenueRelations(),
  });
}

// =======================
// Commands
// =======================
async function createOrUpdateRevenue({
  companyId,
  trip_id,
  amount,
  currency,
  source,
  contract_id,
  invoice_id,
  notes,
  entered_by,
}) {
  const trip = await getTripOrThrow(trip_id, companyId);

  if (upper(trip.financial_status) === "CLOSED") {
    throw buildConflict("Trip finance is CLOSED. Revenue cannot be changed");
  }

  const parsedAmount = toNumber(amount);
  if (parsedAmount === null || parsedAmount < 0) {
    throw buildBadRequest("Valid amount is required");
  }

  const normalizedSource = validateSource(source);

  const selectedContract = await validateContractForTrip({
    trip,
    companyId,
    contract_id: contract_id || trip.contract_id || null,
  });

  const invoice = await validateInvoiceForTrip({
    trip,
    companyId,
    invoice_id: invoice_id || null,
    contract_id: selectedContract?.id || trip.contract_id || null,
  });

  if (
    normalizedSource === "CONTRACT" &&
    !selectedContract &&
    !trip.contract_id
  ) {
    throw buildBadRequest(
      "For CONTRACT revenue, trip must have contract_id or you must pass contract_id"
    );
  }

  if (normalizedSource === "INVOICE" && !invoice) {
    throw buildBadRequest("For INVOICE revenue, invoice_id is required");
  }

  const effectiveContractId =
    selectedContract?.id ||
    invoice?.contract_id ||
    trip.contract_id ||
    null;

  if (trip.contract_id && effectiveContractId && trip.contract_id !== effectiveContractId) {
    throw buildBadRequest("Resolved contract does not match trip contract_id");
  }

  const resolvedCurrency =
    currency ||
    selectedContract?.currency ||
    trip.contract?.currency ||
    trip.revenue_currency ||
    "EGP";

  const created = await prisma.$transaction(async (tx) => {
    const revenue = await tx.trip_revenues.create({
      data: {
        company_id: companyId,
        trip_id,
        client_id: trip.client_id,
        contract_id: effectiveContractId,
        invoice_id: invoice?.id || null,
        amount: parsedAmount,
        currency: resolvedCurrency,
        source: normalizedSource,
        status: "DRAFT",
        entered_by: entered_by || null,
        notes: notes || null,
      },
      include: includeRevenueRelations(),
    });

    await tx.trips.update({
      where: { id: trip_id },
      data: {
        contract_id: effectiveContractId,
        agreed_revenue: parsedAmount,
        revenue_currency: resolvedCurrency,
        revenue_entry_mode: pickRevenueEntryMode(normalizedSource),
      },
    });

    return revenue;
  });

  return created;
}

async function approveCurrentRevenue({
  companyId,
  trip_id,
  approved_by,
}) {
  const trip = await getTripOrThrow(trip_id, companyId);

  if (upper(trip.financial_status) === "CLOSED") {
    throw buildConflict("Trip finance is CLOSED. Revenue cannot be approved");
  }

  const current = await prisma.trip_revenues.findFirst({
    where: {
      trip_id,
      company_id: companyId,
    },
    orderBy: [{ entered_at: "desc" }],
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      source: true,
      contract_id: true,
    },
  });

  if (!current) {
    throw buildNotFound("Current trip revenue not found");
  }

  if (upper(current.status) === "APPROVED") {
    throw buildConflict("Current trip revenue is already approved");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const revenue = await tx.trip_revenues.update({
      where: { id: current.id },
      data: {
        status: "APPROVED",
        approved_by: approved_by || null,
        approved_at: new Date(),
      },
      include: includeRevenueRelations(),
    });

    await tx.trips.update({
      where: { id: trip_id },
      data: {
        contract_id: revenue.contract_id || trip.contract_id || null,
        agreed_revenue: revenue.amount,
        revenue_currency: revenue.currency || "EGP",
        revenue_entry_mode: pickRevenueEntryMode(upper(revenue.source)),
      },
    });

    return revenue;
  });

  return updated;
}

async function autoCalculateTripRevenue({
  companyId,
  trip_id,
  entered_by,
  notes,
  contract_id = null,
  autoApprove = false,
}) {
  const trip = await getTripOrThrow(trip_id, companyId);

  if (upper(trip.financial_status) === "CLOSED") {
    throw buildConflict(
      "Trip finance is CLOSED. Revenue cannot be auto-calculated"
    );
  }

  let resolver = null;

  try {
    resolver = await contractPricingService.resolveTripPrice({
      tripId: trip_id,
      contractId: contract_id || trip.contract_id || null,
      companyId,
    });
  } catch (err) {
    resolver = null;
  }

  if (!resolver?.matched && !resolver?.resolved_rule) {
    throw buildNotFound("No matching pricing rule found for trip");
  }

  const amount = toNumber(getRevenueAmountFromResolver(resolver));
  if (amount === null || amount < 0) {
    throw buildBadRequest("Resolved pricing amount is invalid");
  }

  const effectiveContractId =
    resolver?.trip?.contract_id ||
    resolver?.resolved_rule?.contract_id ||
    contract_id ||
    trip.contract_id ||
    null;

  const selectedContract = await validateContractForTrip({
    trip,
    companyId,
    contract_id: effectiveContractId,
  });

  const currency = getRevenueCurrencyFromResolver(
    resolver,
    selectedContract?.currency || trip.revenue_currency || "EGP"
  );

  const created = await prisma.$transaction(async (tx) => {
    const revenue = await tx.trip_revenues.create({
      data: {
        company_id: companyId,
        trip_id,
        client_id: trip.client_id,
        contract_id: effectiveContractId,
        invoice_id: null,
        amount,
        currency,
        source: "CONTRACT",
        status: autoApprove ? "APPROVED" : "DRAFT",
        entered_by: entered_by || null,
        approved_by: autoApprove ? entered_by || null : null,
        approved_at: autoApprove ? new Date() : null,
        notes: notes || "AUTO_CALCULATED_FROM_PRICING_RULE",
      },
      include: includeRevenueRelations(),
    });

    await tx.trips.update({
      where: { id: trip_id },
      data: {
        contract_id: effectiveContractId,
        agreed_revenue: amount,
        revenue_currency: currency,
        revenue_entry_mode: "CONTRACT",
      },
    });

    return revenue;
  });

  return {
    success: true,
    trip_id,
    resolver,
    revenue: created,
  };
}

async function getTripProfitability(tripId, companyId) {
  return tripFinanceService.getTripFinanceSummary(tripId, companyId);
}

module.exports = {
  getByTripId,
  getRevenueHistoryByTripId,
  createOrUpdateRevenue,
  approveCurrentRevenue,
  autoCalculateTripRevenue,
  getTripProfitability,
};