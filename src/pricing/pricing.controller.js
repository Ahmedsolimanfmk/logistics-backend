// =======================
// src/pricing/pricing.service.js
// =======================

const prisma = require("../prisma");

// =======================
// Helpers
// =======================
function s(v) {
  const x = v == null ? "" : String(v);
  const t = x.trim();
  return t ? t : null;
}

function upper(v) {
  const x = s(v);
  return x ? x.toUpperCase() : null;
}

function toNullableNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toNullableInt(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function toDateOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function throwBadRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  throw err;
}

function throwNotFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  throw err;
}

function validateMoneyField(name, value, required = false) {
  const n = toNullableNumber(value);
  if (required && n === null) throwBadRequest(`${name} is required`);
  if (n !== null && n < 0) throwBadRequest(`${name} must be >= 0`);
  return n;
}

function validateWeightRange(minWeight, maxWeight) {
  if (minWeight !== null && minWeight < 0) {
    throwBadRequest("min_weight must be >= 0");
  }
  if (maxWeight !== null && maxWeight < 0) {
    throwBadRequest("max_weight must be >= 0");
  }
  if (minWeight !== null && maxWeight !== null && minWeight > maxWeight) {
    throwBadRequest("min_weight cannot be greater than max_weight");
  }
}

function isWithinDateRange(rule, now = new Date()) {
  if (rule.effective_from && new Date(rule.effective_from) > now) return false;
  if (rule.effective_to && new Date(rule.effective_to) < now) return false;
  return true;
}

function matchField(ruleValue, inputValue) {
  if (!ruleValue) return true; // wildcard
  if (inputValue == null || inputValue === "") return false;
  return String(ruleValue) === String(inputValue);
}

function matchWeight(rule, weight) {
  if (weight == null) return true;

  const w = Number(weight);
  if (!Number.isFinite(w) || w < 0) return false;

  if (rule.min_weight != null && w < Number(rule.min_weight)) return false;
  if (rule.max_weight != null && w > Number(rule.max_weight)) return false;

  return true;
}

function normalizePayload(payload = {}) {
  const base_price = validateMoneyField("base_price", payload.base_price, true);
  const price_per_ton = validateMoneyField("price_per_ton", payload.price_per_ton, false);
  const price_per_km = validateMoneyField("price_per_km", payload.price_per_km, false);

  const min_weight = toNullableNumber(payload.min_weight);
  const max_weight = toNullableNumber(payload.max_weight);
  validateWeightRange(min_weight, max_weight);

  const priority = toNullableInt(payload.priority);
  if (priority !== null && priority < 0) {
    throwBadRequest("priority must be >= 0");
  }

  const effective_from = toDateOrNull(payload.effective_from);
  const effective_to = toDateOrNull(payload.effective_to);

  if (payload.effective_from !== undefined && effective_from === null && payload.effective_from !== null && payload.effective_from !== "") {
    throwBadRequest("Invalid effective_from");
  }

  if (payload.effective_to !== undefined && effective_to === null && payload.effective_to !== null && payload.effective_to !== "") {
    throwBadRequest("Invalid effective_to");
  }

  if (effective_from && effective_to && effective_from > effective_to) {
    throwBadRequest("effective_from cannot be after effective_to");
  }

  const contract_id = s(payload.contract_id);
  const client_id = s(payload.client_id);

  if (!contract_id || !isUuid(contract_id)) throwBadRequest("Valid contract_id is required");
  if (!client_id || !isUuid(client_id)) throwBadRequest("Valid client_id is required");

  const route_id = s(payload.route_id);
  const pickup_site_id = s(payload.pickup_site_id);
  const dropoff_site_id = s(payload.dropoff_site_id);
  const from_zone_id = s(payload.from_zone_id);
  const to_zone_id = s(payload.to_zone_id);
  const vehicle_class_id = s(payload.vehicle_class_id);
  const cargo_type_id = s(payload.cargo_type_id);

  if (route_id && !isUuid(route_id)) throwBadRequest("Invalid route_id");
  if (pickup_site_id && !isUuid(pickup_site_id)) throwBadRequest("Invalid pickup_site_id");
  if (dropoff_site_id && !isUuid(dropoff_site_id)) throwBadRequest("Invalid dropoff_site_id");
  if (from_zone_id && !isUuid(from_zone_id)) throwBadRequest("Invalid from_zone_id");
  if (to_zone_id && !isUuid(to_zone_id)) throwBadRequest("Invalid to_zone_id");
  if (vehicle_class_id && !isUuid(vehicle_class_id)) throwBadRequest("Invalid vehicle_class_id");
  if (cargo_type_id && !isUuid(cargo_type_id)) throwBadRequest("Invalid cargo_type_id");

  return {
    contract_id,
    client_id,
    route_id: route_id || null,
    pickup_site_id: pickup_site_id || null,
    dropoff_site_id: dropoff_site_id || null,
    from_zone_id: from_zone_id || null,
    to_zone_id: to_zone_id || null,
    vehicle_class_id: vehicle_class_id || null,
    cargo_type_id: cargo_type_id || null,
    trip_type: upper(payload.trip_type),
    min_weight,
    max_weight,
    base_price,
    currency: s(payload.currency) || "EGP",
    price_per_ton,
    price_per_km,
    priority: priority == null ? 100 : priority,
    effective_from,
    effective_to,
    is_active: typeof payload.is_active === "boolean" ? payload.is_active : true,
    notes: s(payload.notes),
  };
}

async function ensureContractBelongsToClient(contract_id, client_id) {
  const contract = await prisma.client_contracts.findUnique({
    where: { id: contract_id },
    select: { id: true, client_id: true, status: true },
  });

  if (!contract) throwNotFound("Contract not found");
  if (contract.client_id !== client_id) {
    throwBadRequest("contract_id does not belong to client_id");
  }

  return contract;
}

async function ensureRelatedRecords(data) {
  const checks = [];

  if (data.route_id) {
    checks.push(
      prisma.routes.findUnique({
        where: { id: data.route_id },
        select: { id: true },
      }).then((row) => {
        if (!row) throwNotFound("Route not found");
      })
    );
  }

  if (data.pickup_site_id) {
    checks.push(
      prisma.sites.findUnique({
        where: { id: data.pickup_site_id },
        select: { id: true },
      }).then((row) => {
        if (!row) throwNotFound("Pickup site not found");
      })
    );
  }

  if (data.dropoff_site_id) {
    checks.push(
      prisma.sites.findUnique({
        where: { id: data.dropoff_site_id },
        select: { id: true },
      }).then((row) => {
        if (!row) throwNotFound("Dropoff site not found");
      })
    );
  }

  if (data.from_zone_id) {
    checks.push(
      prisma.zones.findUnique({
        where: { id: data.from_zone_id },
        select: { id: true },
      }).then((row) => {
        if (!row) throwNotFound("From zone not found");
      })
    );
  }

  if (data.to_zone_id) {
    checks.push(
      prisma.zones.findUnique({
        where: { id: data.to_zone_id },
        select: { id: true },
      }).then((row) => {
        if (!row) throwNotFound("To zone not found");
      })
    );
  }

  if (data.vehicle_class_id) {
    checks.push(
      prisma.vehicle_classes.findUnique({
        where: { id: data.vehicle_class_id },
        select: { id: true },
      }).then((row) => {
        if (!row) throwNotFound("Vehicle class not found");
      })
    );
  }

  if (data.cargo_type_id) {
    checks.push(
      prisma.cargo_types.findUnique({
        where: { id: data.cargo_type_id },
        select: { id: true },
      }).then((row) => {
        if (!row) throwNotFound("Cargo type not found");
      })
    );
  }

  await Promise.all(checks);
}

function buildRuleListWhere(query = {}) {
  const where = {};

  if (query.contract_id) where.contract_id = String(query.contract_id).trim();
  if (query.client_id) where.client_id = String(query.client_id).trim();
  if (query.route_id) where.route_id = String(query.route_id).trim();
  if (query.pickup_site_id) where.pickup_site_id = String(query.pickup_site_id).trim();
  if (query.dropoff_site_id) where.dropoff_site_id = String(query.dropoff_site_id).trim();
  if (query.vehicle_class_id) where.vehicle_class_id = String(query.vehicle_class_id).trim();
  if (query.cargo_type_id) where.cargo_type_id = String(query.cargo_type_id).trim();
  if (query.trip_type) where.trip_type = String(query.trip_type).trim().toUpperCase();

  if (query.is_active === "true") where.is_active = true;
  if (query.is_active === "false") where.is_active = false;

  return where;
}

// =======================
// CRUD
// =======================
async function createPricingRule(payload) {
  const data = normalizePayload(payload);

  await ensureContractBelongsToClient(data.contract_id, data.client_id);
  await ensureRelatedRecords(data);

  const created = await prisma.contract_pricing_rules.create({
    data,
    include: {
      client_contracts: { select: { id: true, contract_no: true, status: true } },
      clients: { select: { id: true, name: true } },
      routes: { select: { id: true, name: true, code: true } },
      pickup_site: { select: { id: true, name: true } },
      dropoff_site: { select: { id: true, name: true } },
      from_zone: { select: { id: true, name: true } },
      to_zone: { select: { id: true, name: true } },
      vehicle_classes: { select: { id: true, code: true, name: true } },
      cargo_types: { select: { id: true, code: true, name: true } },
    },
  });

  return created;
}

async function listPricingRules(query = {}) {
  const page = Math.max(parseInt(query.page || "1", 10), 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize || "25", 10), 1), 100);
  const skip = (page - 1) * pageSize;

  const where = buildRuleListWhere(query);

  const [items, total] = await Promise.all([
    prisma.contract_pricing_rules.findMany({
      where,
      orderBy: [{ priority: "asc" }, { created_at: "desc" }],
      skip,
      take: pageSize,
      include: {
        client_contracts: { select: { id: true, contract_no: true, status: true } },
        clients: { select: { id: true, name: true } },
        routes: { select: { id: true, name: true, code: true } },
        pickup_site: { select: { id: true, name: true } },
        dropoff_site: { select: { id: true, name: true } },
        from_zone: { select: { id: true, name: true } },
        to_zone: { select: { id: true, name: true } },
        vehicle_classes: { select: { id: true, code: true, name: true } },
        cargo_types: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.contract_pricing_rules.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

async function getPricingRuleById(id) {
  const row = await prisma.contract_pricing_rules.findUnique({
    where: { id },
    include: {
      client_contracts: { select: { id: true, contract_no: true, status: true } },
      clients: { select: { id: true, name: true } },
      routes: { select: { id: true, name: true, code: true } },
      pickup_site: { select: { id: true, name: true } },
      dropoff_site: { select: { id: true, name: true } },
      from_zone: { select: { id: true, name: true } },
      to_zone: { select: { id: true, name: true } },
      vehicle_classes: { select: { id: true, code: true, name: true } },
      cargo_types: { select: { id: true, code: true, name: true } },
    },
  });

  if (!row) throwNotFound("Pricing rule not found");
  return row;
}

async function updatePricingRule(id, payload) {
  const existing = await prisma.contract_pricing_rules.findUnique({
    where: { id },
  });

  if (!existing) throwNotFound("Pricing rule not found");

  const merged = {
    contract_id: payload.contract_id !== undefined ? payload.contract_id : existing.contract_id,
    client_id: payload.client_id !== undefined ? payload.client_id : existing.client_id,
    route_id: payload.route_id !== undefined ? payload.route_id : existing.route_id,
    pickup_site_id: payload.pickup_site_id !== undefined ? payload.pickup_site_id : existing.pickup_site_id,
    dropoff_site_id: payload.dropoff_site_id !== undefined ? payload.dropoff_site_id : existing.dropoff_site_id,
    from_zone_id: payload.from_zone_id !== undefined ? payload.from_zone_id : existing.from_zone_id,
    to_zone_id: payload.to_zone_id !== undefined ? payload.to_zone_id : existing.to_zone_id,
    vehicle_class_id: payload.vehicle_class_id !== undefined ? payload.vehicle_class_id : existing.vehicle_class_id,
    cargo_type_id: payload.cargo_type_id !== undefined ? payload.cargo_type_id : existing.cargo_type_id,
    trip_type: payload.trip_type !== undefined ? payload.trip_type : existing.trip_type,
    min_weight: payload.min_weight !== undefined ? payload.min_weight : existing.min_weight,
    max_weight: payload.max_weight !== undefined ? payload.max_weight : existing.max_weight,
    base_price: payload.base_price !== undefined ? payload.base_price : existing.base_price,
    currency: payload.currency !== undefined ? payload.currency : existing.currency,
    price_per_ton: payload.price_per_ton !== undefined ? payload.price_per_ton : existing.price_per_ton,
    price_per_km: payload.price_per_km !== undefined ? payload.price_per_km : existing.price_per_km,
    priority: payload.priority !== undefined ? payload.priority : existing.priority,
    effective_from: payload.effective_from !== undefined ? payload.effective_from : existing.effective_from,
    effective_to: payload.effective_to !== undefined ? payload.effective_to : existing.effective_to,
    is_active: payload.is_active !== undefined ? payload.is_active : existing.is_active,
    notes: payload.notes !== undefined ? payload.notes : existing.notes,
  };

  const data = normalizePayload(merged);

  await ensureContractBelongsToClient(data.contract_id, data.client_id);
  await ensureRelatedRecords(data);

  const updated = await prisma.contract_pricing_rules.update({
    where: { id },
    data,
    include: {
      client_contracts: { select: { id: true, contract_no: true, status: true } },
      clients: { select: { id: true, name: true } },
      routes: { select: { id: true, name: true, code: true } },
      pickup_site: { select: { id: true, name: true } },
      dropoff_site: { select: { id: true, name: true } },
      from_zone: { select: { id: true, name: true } },
      to_zone: { select: { id: true, name: true } },
      vehicle_classes: { select: { id: true, code: true, name: true } },
      cargo_types: { select: { id: true, code: true, name: true } },
    },
  });

  return updated;
}

async function togglePricingRule(id) {
  const existing = await prisma.contract_pricing_rules.findUnique({
    where: { id },
    select: { id: true, is_active: true },
  });

  if (!existing) throwNotFound("Pricing rule not found");

  const updated = await prisma.contract_pricing_rules.update({
    where: { id },
    data: {
      is_active: !existing.is_active,
    },
  });

  return updated;
}

// =======================
// Resolve price
// =======================
async function resolveTripPrice(input) {
  const {
    contract_id,
    route_id,
    pickup_site_id,
    dropoff_site_id,
    from_zone_id,
    to_zone_id,
    vehicle_class_id,
    cargo_type_id,
    trip_type,
    weight,
    distance_km,
  } = input || {};

  if (!contract_id) {
    throwBadRequest("contract_id is required");
  }

  const rules = await prisma.contract_pricing_rules.findMany({
    where: {
      contract_id: String(contract_id),
      is_active: true,
    },
    orderBy: [{ priority: "asc" }, { created_at: "desc" }],
    include: {
      routes: { select: { id: true, name: true, code: true, distance_km: true } },
      pickup_site: { select: { id: true, name: true } },
      dropoff_site: { select: { id: true, name: true } },
      from_zone: { select: { id: true, name: true } },
      to_zone: { select: { id: true, name: true } },
      vehicle_classes: { select: { id: true, code: true, name: true } },
      cargo_types: { select: { id: true, code: true, name: true } },
    },
  });

  if (!rules.length) {
    throwNotFound("No pricing rules found for contract");
  }

  const matched = rules.filter((r) => {
    if (!isWithinDateRange(r)) return false;

    if (!matchField(r.route_id, route_id)) return false;
    if (!matchField(r.pickup_site_id, pickup_site_id)) return false;
    if (!matchField(r.dropoff_site_id, dropoff_site_id)) return false;
    if (!matchField(r.from_zone_id, from_zone_id)) return false;
    if (!matchField(r.to_zone_id, to_zone_id)) return false;
    if (!matchField(r.vehicle_class_id, vehicle_class_id)) return false;
    if (!matchField(r.cargo_type_id, cargo_type_id)) return false;
    if (!matchField(r.trip_type, trip_type ? String(trip_type).toUpperCase() : trip_type)) return false;
    if (!matchWeight(r, weight)) return false;

    return true;
  });

  if (!matched.length) {
    const err = new Error("No matching pricing rule found");
    err.statusCode = 404;
    err.details = {
      contract_id,
      route_id: route_id || null,
      pickup_site_id: pickup_site_id || null,
      dropoff_site_id: dropoff_site_id || null,
      from_zone_id: from_zone_id || null,
      to_zone_id: to_zone_id || null,
      vehicle_class_id: vehicle_class_id || null,
      cargo_type_id: cargo_type_id || null,
      trip_type: trip_type || null,
      weight: weight ?? null,
    };
    throw err;
  }

  const rule = matched[0];

  let usedDistanceKm = toNullableNumber(distance_km);
  if (usedDistanceKm == null && rule.routes?.distance_km != null) {
    usedDistanceKm = Number(rule.routes.distance_km);
  }

  const weightNum = toNullableNumber(weight);
  let price = Number(rule.base_price || 0);

  const breakdown = {
    base_price: Number(rule.base_price || 0),
    per_km: 0,
    per_ton: 0,
    distance_km: usedDistanceKm || 0,
    weight: weightNum || 0,
  };

  if (rule.price_per_km != null && usedDistanceKm != null) {
    const kmValue = Number(rule.price_per_km) * Number(usedDistanceKm);
    price += kmValue;
    breakdown.per_km = kmValue;
  }

  if (rule.price_per_ton != null && weightNum != null) {
    const tonValue = Number(rule.price_per_ton) * Number(weightNum);
    price += tonValue;
    breakdown.per_ton = tonValue;
  }

  return {
    price: Math.round(price * 100) / 100,
    currency: rule.currency || "EGP",
    rule_id: rule.id,
    breakdown: {
      ...breakdown,
      base_price: Math.round(breakdown.base_price * 100) / 100,
      per_km: Math.round(breakdown.per_km * 100) / 100,
      per_ton: Math.round(breakdown.per_ton * 100) / 100,
    },
    matched_rule: rule,
    matched_count: matched.length,
  };
}

module.exports = {
  createPricingRule,
  listPricingRules,
  getPricingRuleById,
  updatePricingRule,
  togglePricingRule,
  resolveTripPrice,
};