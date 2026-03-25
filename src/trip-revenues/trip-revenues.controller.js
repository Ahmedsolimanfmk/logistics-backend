const prisma = require("../prisma");
const tripFinanceService = require("../trips/trip-finance.service");

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
      route_id: true,
      pickup_site_id: true,
      dropoff_site_id: true,
      cargo_type_id: true,
      trip_type: true,
      cargo_weight: true,
    },
  });

  if (!trip) {
    const err = new Error("Trip not found");
    err.statusCode = 404;
    throw err;
  }

  return trip;
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

async function buildPricingRuleSnapshot(pricing_rule_id) {
  if (!pricing_rule_id) return null;

  const rule = await prisma.contract_pricing_rules.findUnique({
    where: { id: pricing_rule_id },
    select: {
      id: true,
      contract_id: true,
      client_id: true,
      route_id: true,
      pickup_site_id: true,
      dropoff_site_id: true,
      from_zone_id: true,
      to_zone_id: true,
      vehicle_class_id: true,
      cargo_type_id: true,
      trip_type: true,
      min_weight: true,
      max_weight: true,
      base_price: true,
      currency: true,
      price_per_ton: true,
      price_per_km: true,
      priority: true,
      effective_from: true,
      effective_to: true,
      is_active: true,
      notes: true,
      updated_at: true,
    },
  });

  if (!rule) {
    throw buildBadRequest("pricing_rule_id is invalid");
  }

  return {
    rule_id: rule.id,
    captured_at: new Date().toISOString(),
    data: rule,
  };
}

// =======================
// Queries
// =======================
async function getByTripId(tripId) {
  await getTripOrThrow(tripId);

  const row = await prisma.trip_revenues.findFirst({
    where: {
      trip_id: tripId,
      is_current: true,
    },
    include: {
      users_entered: {
        select: { id: true, full_name: true, email: true, role: true },
      },
      users_approved: {
        select: { id: true, full_name: true, email: true, role: true },
      },
      users_replaced: {
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
      contract_pricing_rules: {
        select: {
          id: true,
          base_price: true,
          currency: true,
          priority: true,
          is_active: true,
        },
      },
    },
  });

  return row;
}

async function getRevenueHistoryByTripId(tripId) {
  await getTripOrThrow(tripId);

  return prisma.trip_revenues.findMany({
    where: { trip_id: tripId },
    orderBy: [{ version_no: "desc" }, { entered_at: "desc" }],
    include: {
      users_entered: {
        select: { id: true, full_name: true, email: true, role: true },
      },
      users_approved: {
        select: { id: true, full_name: true, email: true, role: true },
      },
      users_replaced: {
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
      contract_pricing_rules: {
        select: {
          id: true,
          base_price: true,
          currency: true,
          priority: true,
          is_active: true,
        },
      },
    },
  });
}

// =======================
// Commands
// =======================
async function createOrUpdateRevenue({
  trip_id,
  amount,
  currency,
  source,
  contract_id,
  invoice_id,
  pricing_rule_id,
  notes,
  entered_by,
}) {
  const trip = await getTripOrThrow(trip_id);

  const parsedAmount = toNumber(amount);
  if (parsedAmount === null || parsedAmount < 0) {
    throw buildBadRequest("Valid amount is required");
  }

  const normalizedSource = validateSource(source);
  const resolvedCurrency = currency || trip.revenue_currency || "EGP";
  const pricingRuleSnapshot = await buildPricingRuleSnapshot(pricing_rule_id);

  const current = await prisma.trip_revenues.findFirst({
    where: {
      trip_id,
      is_current: true,
    },
    select: {
      id: true,
      version_no: true,
      is_approved: true,
    },
  });

  const data = await prisma.$transaction(async (tx) => {
    if (current) {
      await tx.trip_revenues.update({
        where: { id: current.id },
        data: {
          is_current: false,
          replaced_at: new Date(),
          replaced_by: entered_by || null,
        },
      });
    }

    const created = await tx.trip_revenues.create({
      data: {
        trip_id,
        client_id: trip.client_id,
        contract_id: contract_id || null,
        invoice_id: invoice_id || null,
        pricing_rule_id: pricing_rule_id || null,
        pricing_rule_snapshot: pricingRuleSnapshot,
        amount: parsedAmount,
        currency: resolvedCurrency,
        source: normalizedSource,
        entered_by: entered_by || null,
        notes: notes || null,
        version_no: current ? current.version_no + 1 : 1,
        is_current: true,
        is_approved: false,
        approved_by: null,
        approved_at: null,
        approval_notes: null,
        replaced_at: null,
        replaced_by: null,
      },
      include: {
        users_entered: {
          select: { id: true, full_name: true, email: true, role: true },
        },
        users_approved: {
          select: { id: true, full_name: true, email: true, role: true },
        },
        users_replaced: {
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
        contract_pricing_rules: {
          select: {
            id: true,
            base_price: true,
            currency: true,
            priority: true,
            is_active: true,
          },
        },
      },
    });

    await tx.trips.update({
      where: { id: trip_id },
      data: {
        agreed_revenue: parsedAmount,
        revenue_currency: resolvedCurrency,
        revenue_entry_mode:
          normalizedSource === "CONTRACT" ? "CONTRACT" : "MANUAL",
      },
    });

    return created;
  });

  return data;
}

async function approveCurrentRevenue({
  trip_id,
  approved_by,
  approval_notes,
}) {
  await getTripOrThrow(trip_id);

  const current = await prisma.trip_revenues.findFirst({
    where: {
      trip_id,
      is_current: true,
    },
    select: {
      id: true,
      is_approved: true,
    },
  });

  if (!current) {
    const err = new Error("Current trip revenue not found");
    err.statusCode = 404;
    throw err;
  }

  return prisma.trip_revenues.update({
    where: { id: current.id },
    data: {
      is_approved: true,
      approved_by: approved_by || null,
      approved_at: new Date(),
      approval_notes: approval_notes || null,
    },
    include: {
      users_entered: {
        select: { id: true, full_name: true, email: true, role: true },
      },
      users_approved: {
        select: { id: true, full_name: true, email: true, role: true },
      },
      users_replaced: {
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
      contract_pricing_rules: {
        select: {
          id: true,
          base_price: true,
          currency: true,
          priority: true,
          is_active: true,
        },
      },
    },
  });
}

async function getTripProfitability(tripId) {
  return tripFinanceService.getTripFinanceSummary(tripId);
}

module.exports = {
  getByTripId,
  getRevenueHistoryByTripId,
  createOrUpdateRevenue,
  approveCurrentRevenue,
  getTripProfitability,
};