const prisma = require("../prisma");

// =======================
// Helpers
// =======================
function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f-]{36}$/i.test(v)
  );
}

function buildError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  return err;
}

function requireCompanyId(company_id) {
  if (!company_id || !isUuid(company_id)) {
    throw buildError("Invalid or missing company_id");
  }
}

// =======================
// Matching helpers
// =======================
function isWithinDateRange(rule, now = new Date()) {
  if (rule.effective_from && new Date(rule.effective_from) > now) return false;
  if (rule.effective_to && new Date(rule.effective_to) < now) return false;
  return true;
}

function matchField(ruleValue, inputValue) {
  if (!ruleValue) return true;
  return String(ruleValue) === String(inputValue);
}

function matchWeight(rule, weight) {
  if (weight == null) return true;

  if (rule.min_weight && weight < Number(rule.min_weight)) return false;
  if (rule.max_weight && weight > Number(rule.max_weight)) return false;

  return true;
}

// =======================
// resolveTripPrice
// =======================
async function resolveTripPrice(input) {
  const {
    company_id,
    contract_id,
    route_id,
    pickup_site_id,
    dropoff_site_id,
    vehicle_class_id,
    cargo_type_id,
    trip_type,
    weight,
    distance_km,
  } = input;

  requireCompanyId(company_id);

  if (!contract_id) {
    throw buildError("contract_id is required");
  }

  // 🔥 FIX: tenant isolation
  const rules = await prisma.contract_pricing_rules.findMany({
    where: {
      contract_id,
      company_id, // 🔥 أهم سطر
      is_active: true,
    },
    orderBy: {
      priority: "asc",
    },
  });

  if (!rules.length) {
    throw buildError("No pricing rules found for contract", 404);
  }

  const matched = rules.filter((r) => {
    if (!isWithinDateRange(r)) return false;

    if (!matchField(r.route_id, route_id)) return false;
    if (!matchField(r.pickup_site_id, pickup_site_id)) return false;
    if (!matchField(r.dropoff_site_id, dropoff_site_id)) return false;
    if (!matchField(r.vehicle_class_id, vehicle_class_id)) return false;
    if (!matchField(r.cargo_type_id, cargo_type_id)) return false;
    if (!matchField(r.trip_type, trip_type)) return false;
    if (!matchWeight(r, weight)) return false;

    return true;
  });

  if (!matched.length) {
    throw buildError("No matching pricing rule found", 404);
  }

  const rule = matched[0];

  let price = Number(rule.base_price || 0);

  let breakdown = {
    base_price: price,
    per_km: 0,
    per_ton: 0,
  };

  if (rule.price_per_km && distance_km) {
    const val = Number(rule.price_per_km) * Number(distance_km);
    price += val;
    breakdown.per_km = val;
  }

  if (rule.price_per_ton && weight) {
    const val = Number(rule.price_per_ton) * Number(weight);
    price += val;
    breakdown.per_ton = val;
  }

  return {
    price,
    currency: rule.currency || "EGP",
    rule_id: rule.id,
    breakdown,
    matched_rule: rule,
  };
}

// =======================
// (Stub CRUD - optional)
// =======================

async function createPricingRule(data) {
  requireCompanyId(data.company_id);

  return prisma.contract_pricing_rules.create({
    data: {
      ...data,
      company_id: data.company_id,
    },
  });
}

async function listPricingRules(query) {
  requireCompanyId(query.company_id);

  return prisma.contract_pricing_rules.findMany({
    where: {
      company_id: query.company_id,
    },
    orderBy: { created_at: "desc" },
  });
}

async function getPricingRuleById(id, company_id) {
  requireCompanyId(company_id);

  const row = await prisma.contract_pricing_rules.findFirst({
    where: { id, company_id },
  });

  if (!row) throw buildError("Rule not found", 404);

  return row;
}

async function updatePricingRule(id, data, company_id) {
  requireCompanyId(company_id);

  await getPricingRuleById(id, company_id);

  return prisma.contract_pricing_rules.update({
    where: { id },
    data,
  });
}

async function togglePricingRule(id, company_id) {
  requireCompanyId(company_id);

  const row = await getPricingRuleById(id, company_id);

  return prisma.contract_pricing_rules.update({
    where: { id },
    data: { is_active: !row.is_active },
  });
}

module.exports = {
  resolveTripPrice,
  createPricingRule,
  listPricingRules,
  getPricingRuleById,
  updatePricingRule,
  togglePricingRule,
};