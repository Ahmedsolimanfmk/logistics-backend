// =======================
// src/pricing/pricing.service.js
// =======================

const prisma = require("../prisma");

// =======================
// Helpers
// =======================

function isWithinDateRange(rule, now = new Date()) {
  if (rule.effective_from && new Date(rule.effective_from) > now) return false;
  if (rule.effective_to && new Date(rule.effective_to) < now) return false;
  return true;
}

function matchField(ruleValue, inputValue) {
  if (!ruleValue) return true; // wildcard
  return String(ruleValue) === String(inputValue);
}

function matchWeight(rule, weight) {
  if (weight == null) return true;

  if (rule.min_weight && weight < Number(rule.min_weight)) return false;
  if (rule.max_weight && weight > Number(rule.max_weight)) return false;

  return true;
}

// =======================
// Core: resolveTripPrice
// =======================

async function resolveTripPrice(input) {
  const {
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

  if (!contract_id) {
    throw { status: 400, message: "contract_id is required" };
  }

  // 1) load rules
  const rules = await prisma.contract_pricing_rules.findMany({
    where: {
      contract_id,
      is_active: true,
    },
    orderBy: {
      priority: "asc",
    },
  });

  if (!rules.length) {
    throw { status: 404, message: "No pricing rules found for contract" };
  }

  // 2) filter rules
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
    throw {
      status: 404,
      message: "No matching pricing rule found",
    };
  }

  // 3) pick best (already sorted by priority)
  const rule = matched[0];

  // =======================
  // 4) calculate price
  // =======================

  let price = Number(rule.base_price || 0);

  let breakdown = {
    base_price: price,
    per_km: 0,
    per_ton: 0,
  };

  // per km
  if (rule.price_per_km && distance_km) {
    const kmValue = Number(rule.price_per_km) * Number(distance_km);
    price += kmValue;
    breakdown.per_km = kmValue;
  }

  // per ton
  if (rule.price_per_ton && weight) {
    const tonValue = Number(rule.price_per_ton) * Number(weight);
    price += tonValue;
    breakdown.per_ton = tonValue;
  }

  return {
    price,
    currency: rule.currency || "EGP",
    rule_id: rule.id,
    breakdown,
    matched_rule: rule,
  };
}

module.exports = {
  resolveTripPrice,
};