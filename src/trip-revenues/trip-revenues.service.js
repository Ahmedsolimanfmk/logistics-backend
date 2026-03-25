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

function buildNotFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

async function getTripOrThrow(tripId) {
  const trip = await prisma.trips.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      client_id: true,
      contract_id: true,
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

      client_contracts: {
        select: {
          id: true,
          client_id: true,
          contract_no: true,
          status: true,
          currency: true,
          end_date: true,
        },
      },
      pickup_site: {
        select: {
          id: true,
          zone_id: true,
          client_id: true,
          name: true,
        },
      },
      dropoff_site: {
        select: {
          id: true,
          zone_id: true,
          client_id: true,
          name: true,
        },
      },
      trip_assignments: {
        where: { is_active: true },
        take: 1,
        select: {
          vehicle_id: true,
          vehicles: {
            select: {
              id: true,
              vehicle_class_id: true,
            },
          },
        },
      },
    },
  });

  if (!trip) {
    const err = new Error("Trip not found");
    err.statusCode = 404;
    throw err;
  }

  const activeAssignment = trip.trip_assignments?.[0] || null;

  return {
    ...trip,
    pickup_zone_id: trip.pickup_site?.zone_id || null,
    dropoff_zone_id: trip.dropoff_site?.zone_id || null,
    vehicle_class_id: activeAssignment?.vehicles?.vehicle_class_id || null,
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

async function validateContractForTrip({ trip, contract_id }) {
  if (!contract_id) return null;

  const contract = await prisma.client_contracts.findUnique({
    where: { id: contract_id },
    select: {
      id: true,
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

async function validateInvoiceForTrip({ trip, invoice_id, contract_id = null }) {
  if (!invoice_id) return null;

  const invoice = await prisma.ar_invoices.findUnique({
    where: { id: invoice_id },
    select: {
      id: true,
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

  if (trip.contract_id && invoice.contract_id && invoice.contract_id !== trip.contract_id) {
    throw buildBadRequest("invoice contract does not match trip contract_id");
  }

  return invoice;
}

async function validatePricingRuleForTrip({ trip, pricing_rule_id, contract_id }) {
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

  if (rule.client_id !== trip.client_id) {
    throw buildBadRequest("pricing_rule_id does not belong to the trip client");
  }

  if (contract_id && rule.contract_id !== contract_id) {
    throw buildBadRequest("pricing_rule_id does not belong to the selected contract");
  }

  if (trip.contract_id && rule.contract_id !== trip.contract_id) {
    throw buildBadRequest("pricing_rule_id does not match trip contract_id");
  }

  return rule;
}

function validatePricingRuleAgainstTrip(rule, trip) {
  if (!rule) return;

  if (rule.route_id) {
    if (!trip.route_id) {
      throw buildBadRequest("Trip has no route_id but pricing_rule requires route_id");
    }
    if (rule.route_id !== trip.route_id) {
      throw buildBadRequest("pricing_rule_id does not match trip route_id");
    }
  }

  if (rule.pickup_site_id) {
    if (!trip.pickup_site_id) {
      throw buildBadRequest("Trip has no pickup_site_id but pricing_rule requires pickup_site_id");
    }
    if (rule.pickup_site_id !== trip.pickup_site_id) {
      throw buildBadRequest("pricing_rule_id does not match trip pickup_site_id");
    }
  }

  if (rule.dropoff_site_id) {
    if (!trip.dropoff_site_id) {
      throw buildBadRequest("Trip has no dropoff_site_id but pricing_rule requires dropoff_site_id");
    }
    if (rule.dropoff_site_id !== trip.dropoff_site_id) {
      throw buildBadRequest("pricing_rule_id does not match trip dropoff_site_id");
    }
  }

  if (rule.from_zone_id) {
    if (!trip.pickup_zone_id) {
      throw buildBadRequest("Trip has no pickup zone but pricing_rule requires from_zone_id");
    }
    if (rule.from_zone_id !== trip.pickup_zone_id) {
      throw buildBadRequest("pricing_rule_id does not match trip pickup zone");
    }
  }

  if (rule.to_zone_id) {
    if (!trip.dropoff_zone_id) {
      throw buildBadRequest("Trip has no dropoff zone but pricing_rule requires to_zone_id");
    }
    if (rule.to_zone_id !== trip.dropoff_zone_id) {
      throw buildBadRequest("pricing_rule_id does not match trip dropoff zone");
    }
  }

  if (rule.cargo_type_id) {
    if (!trip.cargo_type_id) {
      throw buildBadRequest("Trip has no cargo_type_id but pricing_rule requires cargo_type_id");
    }
    if (rule.cargo_type_id !== trip.cargo_type_id) {
      throw buildBadRequest("pricing_rule_id does not match trip cargo_type_id");
    }
  }

  if (rule.trip_type) {
    if (!trip.trip_type) {
      throw buildBadRequest("Trip has no trip_type but pricing_rule requires trip_type");
    }
    if (upper(rule.trip_type) !== upper(trip.trip_type)) {
      throw buildBadRequest("pricing_rule_id does not match trip trip_type");
    }
  }

  if (rule.vehicle_class_id) {
    if (!trip.vehicle_class_id) {
      throw buildBadRequest(
        "Trip has no active assigned vehicle class but pricing_rule requires vehicle_class_id"
      );
    }
    if (rule.vehicle_class_id !== trip.vehicle_class_id) {
      throw buildBadRequest("pricing_rule_id does not match trip vehicle_class_id");
    }
  }

  const weight = toNumber(trip.cargo_weight);

  if ((rule.min_weight != null || rule.max_weight != null) && weight == null) {
    throw buildBadRequest(
      "Trip cargo_weight is required because the selected pricing rule uses weight range"
    );
  }

  if (rule.min_weight != null && weight != null && weight < Number(rule.min_weight)) {
    throw buildBadRequest("Trip cargo_weight is أقل من الحد الأدنى للقاعدة السعرية");
  }

  if (rule.max_weight != null && weight != null && weight > Number(rule.max_weight)) {
    throw buildBadRequest("Trip cargo_weight is أكبر من الحد الأقصى للقاعدة السعرية");
  }
}

function buildPricingRuleSnapshot(rule) {
  if (!rule) return null;

  return {
    rule_id: rule.id,
    captured_at: new Date().toISOString(),
    data: {
      id: rule.id,
      contract_id: rule.contract_id,
      client_id: rule.client_id,
      route_id: rule.route_id,
      pickup_site_id: rule.pickup_site_id,
      dropoff_site_id: rule.dropoff_site_id,
      from_zone_id: rule.from_zone_id,
      to_zone_id: rule.to_zone_id,
      vehicle_class_id: rule.vehicle_class_id,
      cargo_type_id: rule.cargo_type_id,
      trip_type: rule.trip_type,
      min_weight: rule.min_weight,
      max_weight: rule.max_weight,
      base_price: rule.base_price,
      currency: rule.currency,
      price_per_ton: rule.price_per_ton,
      price_per_km: rule.price_per_km,
      priority: rule.priority,
      effective_from: rule.effective_from,
      effective_to: rule.effective_to,
      is_active: rule.is_active,
      notes: rule.notes,
      updated_at: rule.updated_at,
    },
  };
}

function pickRevenueEntryMode(source) {
  if (source === "CONTRACT") return "CONTRACT";
  return "MANUAL";
}

function includeRevenueRelations() {
  return {
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
      select: { id: true, contract_no: true, status: true, currency: true },
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
    orderBy: [{ version_no: "desc" }],
    include: includeRevenueRelations(),
  });

  return row;
}

async function getRevenueHistoryByTripId(tripId) {
  await getTripOrThrow(tripId);

  return prisma.trip_revenues.findMany({
    where: { trip_id: tripId },
    orderBy: [{ version_no: "desc" }, { entered_at: "desc" }],
    include: includeRevenueRelations(),
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

  if (upper(trip.financial_status) === "CLOSED") {
    const err = new Error("Trip finance is CLOSED. Revenue cannot be changed");
    err.statusCode = 409;
    throw err;
  }

  const parsedAmount = toNumber(amount);
  if (parsedAmount === null || parsedAmount < 0) {
    throw buildBadRequest("Valid amount is required");
  }

  const normalizedSource = validateSource(source);

  const selectedContract = await validateContractForTrip({
    trip,
    contract_id: contract_id || trip.contract_id || null,
  });

  const invoice = await validateInvoiceForTrip({
    trip,
    invoice_id: invoice_id || null,
    contract_id: selectedContract?.id || trip.contract_id || null,
  });

  const pricingRule = await validatePricingRuleForTrip({
    trip,
    pricing_rule_id: pricing_rule_id || null,
    contract_id: selectedContract?.id || trip.contract_id || null,
  });

  validatePricingRuleAgainstTrip(pricingRule, trip);

  if (normalizedSource === "CONTRACT" && !selectedContract && !pricingRule && !trip.contract_id) {
    throw buildBadRequest(
      "For CONTRACT revenue, trip must have contract_id or you must pass contract_id or pricing_rule_id"
    );
  }

  if (normalizedSource === "INVOICE" && !invoice) {
    throw buildBadRequest("For INVOICE revenue, invoice_id is required");
  }

  const effectiveContractId =
    selectedContract?.id ||
    pricingRule?.contract_id ||
    invoice?.contract_id ||
    trip.contract_id ||
    null;

  if (trip.contract_id && effectiveContractId && trip.contract_id !== effectiveContractId) {
    throw buildBadRequest("Resolved contract does not match trip contract_id");
  }

  const resolvedCurrency =
    currency ||
    pricingRule?.currency ||
    selectedContract?.currency ||
    trip.client_contracts?.currency ||
    trip.revenue_currency ||
    "EGP";

  const pricingRuleSnapshot = buildPricingRuleSnapshot(pricingRule);

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
        contract_id: effectiveContractId,
        invoice_id: invoice?.id || null,
        pricing_rule_id: pricingRule?.id || null,
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

    return created;
  });

  return data;
}

async function approveCurrentRevenue({
  trip_id,
  approved_by,
  approval_notes,
}) {
  const trip = await getTripOrThrow(trip_id);

  if (upper(trip.financial_status) === "CLOSED") {
    const err = new Error("Trip finance is CLOSED. Revenue cannot be approved");
    err.statusCode = 409;
    throw err;
  }

  const current = await prisma.trip_revenues.findFirst({
    where: {
      trip_id,
      is_current: true,
    },
    select: {
      id: true,
      is_approved: true,
      amount: true,
      currency: true,
      source: true,
      contract_id: true,
    },
  });

  if (!current) {
    const err = new Error("Current trip revenue not found");
    err.statusCode = 404;
    throw err;
  }

  if (current.is_approved) {
    const err = new Error("Current trip revenue is already approved");
    err.statusCode = 409;
    throw err;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const revenue = await tx.trip_revenues.update({
      where: { id: current.id },
      data: {
        is_approved: true,
        approved_by: approved_by || null,
        approved_at: new Date(),
        approval_notes: approval_notes || null,
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