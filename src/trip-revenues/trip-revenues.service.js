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
          company_id: true,
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
          company_id: true,
          zone_id: true,
          client_id: true,
          name: true,
        },
      },
      dropoff_site: {
        select: {
          id: true,
          company_id: true,
          zone_id: true,
          client_id: true,
          name: true,
        },
      },
      routes: {
        select: {
          id: true,
          company_id: true,
          name: true,
          code: true,
          distance_km: true,
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
          vehicles: {
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
    route_distance_km: trip.routes?.distance_km || null,
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

async function validatePricingRuleForTrip({
  trip,
  companyId,
  pricing_rule_id,
  contract_id,
}) {
  if (!pricing_rule_id) return null;

  const rule = await prisma.contract_pricing_rules.findFirst({
    where: {
      id: pricing_rule_id,
      company_id: companyId,
    },
    select: {
      id: true,
      company_id: true,
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
      created_at: true,
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
      throw buildBadRequest(
        "Trip has no pickup_site_id but pricing_rule requires pickup_site_id"
      );
    }
    if (rule.pickup_site_id !== trip.pickup_site_id) {
      throw buildBadRequest("pricing_rule_id does not match trip pickup_site_id");
    }
  }

  if (rule.dropoff_site_id) {
    if (!trip.dropoff_site_id) {
      throw buildBadRequest(
        "Trip has no dropoff_site_id but pricing_rule requires dropoff_site_id"
      );
    }
    if (rule.dropoff_site_id !== trip.dropoff_site_id) {
      throw buildBadRequest("pricing_rule_id does not match trip dropoff_site_id");
    }
  }

  if (rule.from_zone_id) {
    if (!trip.pickup_zone_id) {
      throw buildBadRequest(
        "Trip has no pickup zone but pricing_rule requires from_zone_id"
      );
    }
    if (rule.from_zone_id !== trip.pickup_zone_id) {
      throw buildBadRequest("pricing_rule_id does not match trip pickup zone");
    }
  }

  if (rule.to_zone_id) {
    if (!trip.dropoff_zone_id) {
      throw buildBadRequest(
        "Trip has no dropoff zone but pricing_rule requires to_zone_id"
      );
    }
    if (rule.to_zone_id !== trip.dropoff_zone_id) {
      throw buildBadRequest("pricing_rule_id does not match trip dropoff zone");
    }
  }

  if (rule.cargo_type_id) {
    if (!trip.cargo_type_id) {
      throw buildBadRequest(
        "Trip has no cargo_type_id but pricing_rule requires cargo_type_id"
      );
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

function buildPricingRuleSnapshot(rule, resolver = null) {
  if (!rule) return null;

  return {
    rule_id: rule.id,
    captured_at: new Date().toISOString(),
    resolver: resolver
      ? {
          matched: !!resolver.matched,
          matched_rules_count: resolver.matched_rules_count || 0,
          resolved_amount: resolver.resolved_rule?.resolved_amount ?? null,
          resolved_currency:
            resolver.resolved_rule?.resolved_currency || rule.currency || null,
        }
      : null,
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
      created_at: rule.created_at || null,
    },
  };
}

function pickRevenueEntryMode(source) {
  if (source === "CONTRACT") return "CONTRACT";
  return "MANUAL";
}

function selectRevenueFields() {
  return {
    id: true,
    company_id: true,
    trip_id: true,
    client_id: true,
    contract_id: true,
    invoice_id: true,
    amount: true,
    currency: true,
    source: true,
    status: true,
    entered_by: true,
    approved_by: true,
    entered_at: true,
    approved_at: true,
    notes: true,
  };
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
      is_current: true,
    },
    orderBy: [{ version_no: "desc" }],
    select: selectRevenueFields(),
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
    orderBy: [{ version_no: "desc" }, { entered_at: "desc" }],
    select: selectRevenueFields(),
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
  pricing_rule_id,
  notes,
  entered_by,
}) {
  const trip = await getTripOrThrow(trip_id, companyId);

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
    companyId,
    contract_id: contract_id || trip.contract_id || null,
  });

  const invoice = await validateInvoiceForTrip({
    trip,
    companyId,
    invoice_id: invoice_id || null,
    contract_id: selectedContract?.id || trip.contract_id || null,
  });

  const pricingRule = await validatePricingRuleForTrip({
    trip,
    companyId,
    pricing_rule_id: pricing_rule_id || null,
    contract_id: selectedContract?.id || trip.contract_id || null,
  });

  validatePricingRuleAgainstTrip(pricingRule, trip);

  if (
    normalizedSource === "CONTRACT" &&
    !selectedContract &&
    !pricingRule &&
    !trip.contract_id
  ) {
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

  const pricingRuleSnapshot = buildPricingRuleSnapshot(pricingRule, null);

  const current = await prisma.trip_revenues.findFirst({
    where: {
      trip_id,
      company_id: companyId,
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
        company_id: companyId,
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
      select: selectRevenueFields(),
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
  companyId,
  trip_id,
  approved_by,
  approval_notes,
}) {
  const trip = await getTripOrThrow(trip_id, companyId);

  if (upper(trip.financial_status) === "CLOSED") {
    const err = new Error("Trip finance is CLOSED. Revenue cannot be approved");
    err.statusCode = 409;
    throw err;
  }

  const current = await prisma.trip_revenues.findFirst({
    where: {
      trip_id,
      company_id: companyId,
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
      select: selectRevenueFields(),
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
    const err = new Error(
      "Trip finance is CLOSED. Revenue cannot be auto-calculated"
    );
    err.statusCode = 409;
    throw err;
  }

  const resolver = await contractPricingService.resolveTripPrice({
    tripId: trip_id,
    contractId: contract_id || trip.contract_id || null,
    companyId,
  });

  if (!resolver?.matched || !resolver?.resolved_rule) {
    const err = new Error("No matching pricing rule found for trip");
    err.statusCode = 404;
    throw err;
  }

  const effectiveContractId =
    resolver.trip?.contract_id ||
    resolver.resolved_rule?.contract_id ||
    trip.contract_id ||
    null;

  const pricingRuleId = resolver.resolved_rule.id;
  const amount = Number(resolver.resolved_rule.resolved_amount || 0);
  const currency =
    resolver.resolved_rule.resolved_currency ||
    resolver.resolved_rule.currency ||
    trip.revenue_currency ||
    "EGP";

  const rule = await validatePricingRuleForTrip({
    trip,
    companyId,
    pricing_rule_id: pricingRuleId,
    contract_id: effectiveContractId,
  });

  validatePricingRuleAgainstTrip(rule, trip);

  const pricingRuleSnapshot = buildPricingRuleSnapshot(rule, resolver);

  const current = await prisma.trip_revenues.findFirst({
    where: {
      trip_id,
      company_id: companyId,
      is_current: true,
    },
    select: {
      id: true,
      version_no: true,
    },
  });

  const created = await prisma.$transaction(async (tx) => {
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

    const newRow = await tx.trip_revenues.create({
      data: {
        company_id: companyId,
        trip_id,
        client_id: trip.client_id,
        contract_id: effectiveContractId,
        invoice_id: null,
        pricing_rule_id: pricingRuleId,
        pricing_rule_snapshot: pricingRuleSnapshot,
        amount,
        currency,
        source: "CONTRACT",
        entered_by: entered_by || null,
        notes: notes || "AUTO_CALCULATED_FROM_PRICING_RULE",
        version_no: current ? current.version_no + 1 : 1,
        is_current: true,
        is_approved: !!autoApprove,
        approved_by: autoApprove ? entered_by || null : null,
        approved_at: autoApprove ? new Date() : null,
        approval_notes: autoApprove ? "AUTO_APPROVED" : null,
        replaced_at: null,
        replaced_by: null,
      },
      select: selectRevenueFields(),
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

    return newRow;
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