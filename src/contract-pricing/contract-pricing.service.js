const prisma = require("../prisma");

// =======================
// Helpers
// =======================
function upper(v) {
  return String(v || "").trim().toUpperCase();
}

function s(v) {
  if (v === undefined || v === null) return null;
  const x = String(v).trim();
  return x ? x : null;
}

function toInt(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

function toNum(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toBool(v, fallback = null) {
  if (typeof v === "boolean") return v;
  if (v === undefined || v === null || v === "") return fallback;

  const x = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(x)) return true;
  if (["false", "0", "no", "n"].includes(x)) return false;
  return fallback;
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

function buildError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parsePaging(query) {
  const page = Math.max(parseInt(query?.page || "1", 10), 1);
  const pageSize = Math.min(Math.max(parseInt(query?.pageSize || "25", 10), 1), 100);
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

function buildTripTypeValue(value) {
  const x = upper(value);
  if (!x) return null;
  const allowed = ["DELIVERY", "TRANSFER", "RETURN", "INTERNAL", "OTHER"];
  if (!allowed.includes(x)) throw buildError("Invalid trip_type");
  return x;
}

function requireCompanyId(company_id) {
  if (!company_id || !isUuid(company_id)) {
    throw buildError("Invalid or missing company_id", 400);
  }
  return company_id;
}

// =======================
// Generic Helpers
// =======================
async function ensureClientExists(clientId, company_id) {
  if (!clientId) return null;
  requireCompanyId(company_id);
  if (!isUuid(clientId)) throw buildError("Invalid client_id");

  const row = await prisma.clients.findFirst({
    where: {
      id: clientId,
      company_id,
    },
    select: { id: true, company_id: true, name: true, is_active: true },
  });

  if (!row) throw buildError("Client not found", 404);
  return row;
}

async function ensureContractExists(contractId, company_id) {
  if (!contractId) return null;
  requireCompanyId(company_id);
  if (!isUuid(contractId)) throw buildError("Invalid contract_id");

  const row = await prisma.client_contracts.findFirst({
    where: {
      id: contractId,
      client: {
        company_id,
      },
    },
    select: {
      id: true,
      client_id: true,
      contract_no: true,
      status: true,
      currency: true,
      start_date: true,
      end_date: true,
    },
  });

  if (!row) throw buildError("Contract not found", 404);
  return row;
}

async function ensureRouteExists(routeId, company_id) {
  if (!routeId) return null;
  requireCompanyId(company_id);
  if (!isUuid(routeId)) throw buildError("Invalid route_id");

  const row = await prisma.routes.findFirst({
    where: {
      id: routeId,
      company_id,
    },
    select: {
      id: true,
      company_id: true,
      client_id: true,
      pickup_site_id: true,
      dropoff_site_id: true,
      name: true,
      code: true,
      distance_km: true,
      is_active: true,
    },
  });

  if (!row) throw buildError("Route not found", 404);
  return row;
}

async function ensureSiteExists(siteId, company_id, label = "site_id") {
  if (!siteId) return null;
  requireCompanyId(company_id);
  if (!isUuid(siteId)) throw buildError(`Invalid ${label}`);

  const row = await prisma.sites.findFirst({
    where: {
      id: siteId,
      company_id,
    },
    select: {
      id: true,
      company_id: true,
      client_id: true,
      name: true,
      is_active: true,
      zone_id: true,
    },
  });

  if (!row) throw buildError(`${label} not found`, 404);
  return row;
}

async function ensureZoneExists(zoneId, company_id, label = "zone_id") {
  if (!zoneId) return null;
  requireCompanyId(company_id);
  if (!isUuid(zoneId)) throw buildError(`Invalid ${label}`);

  const row = await prisma.zones.findFirst({
    where: {
      id: zoneId,
      company_id,
    },
    select: {
      id: true,
      company_id: true,
      name: true,
      code: true,
      is_active: true,
    },
  });

  if (!row) throw buildError(`${label} not found`, 404);
  return row;
}

async function ensureCargoTypeExists(cargoTypeId, company_id) {
  if (!cargoTypeId) return null;
  requireCompanyId(company_id);
  if (!isUuid(cargoTypeId)) throw buildError("Invalid cargo_type_id");

  const row = await prisma.cargo_types.findFirst({
    where: {
      id: cargoTypeId,
      company_id,
    },
    select: {
      id: true,
      company_id: true,
      code: true,
      name: true,
      is_active: true,
    },
  });

  if (!row) throw buildError("cargo_type_id not found", 404);
  return row;
}

async function ensureVehicleClassExists(vehicleClassId, company_id) {
  if (!vehicleClassId) return null;
  requireCompanyId(company_id);
  if (!isUuid(vehicleClassId)) throw buildError("Invalid vehicle_class_id");

  const row = await prisma.vehicle_classes.findFirst({
    where: {
      id: vehicleClassId,
      company_id,
    },
    select: {
      id: true,
      company_id: true,
      code: true,
      name: true,
      is_active: true,
    },
  });

  if (!row) throw buildError("vehicle_class_id not found", 404);
  return row;
}

// =======================
// Vehicle Classes
// =======================
async function listVehicleClasses(query = {}) {
  const company_id = requireCompanyId(query.company_id);
  const { page, pageSize, skip } = parsePaging(query);
  const q = s(query.q);
  const is_active = toBool(query.is_active, null);

  const where = { company_id };

  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  if (typeof is_active === "boolean") where.is_active = is_active;

  const [items, total] = await Promise.all([
    prisma.vehicle_classes.findMany({
      where,
      orderBy: [{ name: "asc" }, { created_at: "desc" }],
      skip,
      take: pageSize,
    }),
    prisma.vehicle_classes.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    pages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

async function getVehicleClassById(id, company_id) {
  requireCompanyId(company_id);
  if (!isUuid(id)) throw buildError("Invalid vehicle class id");

  const row = await prisma.vehicle_classes.findFirst({
    where: { id, company_id },
  });

  if (!row) throw buildError("Vehicle class not found", 404);
  return row;
}

async function createVehicleClass(payload = {}) {
  const company_id = requireCompanyId(payload.company_id);
  const code = s(payload.code);
  const name = s(payload.name);
  const description = s(payload.description);
  const is_active = typeof payload.is_active === "boolean" ? payload.is_active : true;

  if (!code) throw buildError("code is required");
  if (!name) throw buildError("name is required");

  return prisma.vehicle_classes.create({
    data: {
      company_id,
      code: upper(code),
      name,
      description,
      is_active,
    },
  });
}

async function updateVehicleClass(id, payload = {}, company_id) {
  requireCompanyId(company_id);
  await getVehicleClassById(id, company_id);

  const data = {};

  if (payload.code !== undefined) {
    const code = s(payload.code);
    if (!code) throw buildError("code cannot be empty");
    data.code = upper(code);
  }

  if (payload.name !== undefined) {
    const name = s(payload.name);
    if (!name) throw buildError("name cannot be empty");
    data.name = name;
  }

  if (payload.description !== undefined) data.description = s(payload.description);
  if (typeof payload.is_active === "boolean") data.is_active = payload.is_active;

  return prisma.vehicle_classes.update({
    where: { id },
    data,
  });
}

async function toggleVehicleClass(id, company_id) {
  requireCompanyId(company_id);
  const row = await getVehicleClassById(id, company_id);

  return prisma.vehicle_classes.update({
    where: { id: row.id },
    data: { is_active: !row.is_active },
  });
}

// =======================
// Cargo Types
// =======================
async function listCargoTypes(query = {}) {
  const company_id = requireCompanyId(query.company_id);
  const { page, pageSize, skip } = parsePaging(query);
  const q = s(query.q);
  const is_active = toBool(query.is_active, null);

  const where = { company_id };

  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  if (typeof is_active === "boolean") where.is_active = is_active;

  const [items, total] = await Promise.all([
    prisma.cargo_types.findMany({
      where,
      orderBy: [{ name: "asc" }, { created_at: "desc" }],
      skip,
      take: pageSize,
    }),
    prisma.cargo_types.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    pages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

async function getCargoTypeById(id, company_id) {
  requireCompanyId(company_id);
  if (!isUuid(id)) throw buildError("Invalid cargo type id");

  const row = await prisma.cargo_types.findFirst({
    where: { id, company_id },
  });

  if (!row) throw buildError("Cargo type not found", 404);
  return row;
}

async function createCargoType(payload = {}) {
  const company_id = requireCompanyId(payload.company_id);
  const code = s(payload.code);
  const name = s(payload.name);
  const description = s(payload.description);
  const is_active = typeof payload.is_active === "boolean" ? payload.is_active : true;

  if (!code) throw buildError("code is required");
  if (!name) throw buildError("name is required");

  return prisma.cargo_types.create({
    data: {
      company_id,
      code: upper(code),
      name,
      description,
      is_active,
    },
  });
}

async function updateCargoType(id, payload = {}, company_id) {
  requireCompanyId(company_id);
  await getCargoTypeById(id, company_id);

  const data = {};

  if (payload.code !== undefined) {
    const code = s(payload.code);
    if (!code) throw buildError("code cannot be empty");
    data.code = upper(code);
  }

  if (payload.name !== undefined) {
    const name = s(payload.name);
    if (!name) throw buildError("name cannot be empty");
    data.name = name;
  }

  if (payload.description !== undefined) data.description = s(payload.description);
  if (typeof payload.is_active === "boolean") data.is_active = payload.is_active;

  return prisma.cargo_types.update({
    where: { id },
    data,
  });
}

async function toggleCargoType(id, company_id) {
  requireCompanyId(company_id);
  const row = await getCargoTypeById(id, company_id);

  return prisma.cargo_types.update({
    where: { id: row.id },
    data: { is_active: !row.is_active },
  });
}

// =======================
// Zones
// =======================
async function listZones(query = {}) {
  const company_id = requireCompanyId(query.company_id);
  const { page, pageSize, skip } = parsePaging(query);
  const q = s(query.q);
  const is_active = toBool(query.is_active, null);

  const where = { company_id };

  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  if (typeof is_active === "boolean") where.is_active = is_active;

  const [items, total] = await Promise.all([
    prisma.zones.findMany({
      where,
      orderBy: [{ name: "asc" }, { created_at: "desc" }],
      skip,
      take: pageSize,
    }),
    prisma.zones.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    pages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

async function getZoneById(id, company_id) {
  requireCompanyId(company_id);
  if (!isUuid(id)) throw buildError("Invalid zone id");

  const row = await prisma.zones.findFirst({
    where: { id, company_id },
  });

  if (!row) throw buildError("Zone not found", 404);
  return row;
}

async function createZone(payload = {}) {
  const company_id = requireCompanyId(payload.company_id);
  const code = s(payload.code);
  const name = s(payload.name);
  const description = s(payload.description);
  const is_active = typeof payload.is_active === "boolean" ? payload.is_active : true;

  if (!name) throw buildError("name is required");

  return prisma.zones.create({
    data: {
      company_id,
      code: code ? upper(code) : null,
      name,
      description,
      is_active,
    },
  });
}

async function updateZone(id, payload = {}, company_id) {
  requireCompanyId(company_id);
  await getZoneById(id, company_id);

  const data = {};

  if (payload.code !== undefined) data.code = s(payload.code) ? upper(payload.code) : null;

  if (payload.name !== undefined) {
    const name = s(payload.name);
    if (!name) throw buildError("name cannot be empty");
    data.name = name;
  }

  if (payload.description !== undefined) data.description = s(payload.description);
  if (typeof payload.is_active === "boolean") data.is_active = payload.is_active;

  return prisma.zones.update({
    where: { id },
    data,
  });
}

async function toggleZone(id, company_id) {
  requireCompanyId(company_id);
  const row = await getZoneById(id, company_id);

  return prisma.zones.update({
    where: { id: row.id },
    data: { is_active: !row.is_active },
  });
}

// =======================
// Routes Master
// =======================
async function listRoutes(query = {}) {
  const company_id = requireCompanyId(query.company_id);
  const { page, pageSize, skip } = parsePaging(query);
  const q = s(query.q);
  const client_id = s(query.client_id);
  const pickup_site_id = s(query.pickup_site_id);
  const dropoff_site_id = s(query.dropoff_site_id);
  const is_active = toBool(query.is_active, null);

  const where = { company_id };

  if (client_id) where.client_id = client_id;
  if (pickup_site_id) where.pickup_site_id = pickup_site_id;
  if (dropoff_site_id) where.dropoff_site_id = dropoff_site_id;
  if (typeof is_active === "boolean") where.is_active = is_active;

  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { origin_label: { contains: q, mode: "insensitive" } },
      { destination_label: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.routes.findMany({
      where,
      orderBy: [{ name: "asc" }, { created_at: "desc" }],
      skip,
      take: pageSize,
      include: {
        clients: { select: { id: true, name: true } },
        pickup_site: { select: { id: true, name: true } },
        dropoff_site: { select: { id: true, name: true } },
      },
    }),
    prisma.routes.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    pages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

async function getRouteById(id, company_id) {
  requireCompanyId(company_id);
  if (!isUuid(id)) throw buildError("Invalid route id");

  const row = await prisma.routes.findFirst({
    where: { id, company_id },
    include: {
      clients: { select: { id: true, name: true } },
      pickup_site: { select: { id: true, name: true } },
      dropoff_site: { select: { id: true, name: true } },
    },
  });

  if (!row) throw buildError("Route not found", 404);
  return row;
}

async function createRoute(payload = {}) {
  const company_id = requireCompanyId(payload.company_id);
  const code = s(payload.code);
  const name = s(payload.name);
  const client_id = s(payload.client_id);
  const pickup_site_id = s(payload.pickup_site_id);
  const dropoff_site_id = s(payload.dropoff_site_id);
  const origin_label = s(payload.origin_label);
  const destination_label = s(payload.destination_label);
  const distance_km = toNum(payload.distance_km);
  const is_active = typeof payload.is_active === "boolean" ? payload.is_active : true;
  const notes = s(payload.notes);

  if (!name) throw buildError("name is required");

  const client = await ensureClientExists(client_id, company_id);
  const pickupSite = await ensureSiteExists(pickup_site_id, company_id, "pickup_site_id");
  const dropoffSite = await ensureSiteExists(dropoff_site_id, company_id, "dropoff_site_id");

  if (pickupSite && client && pickupSite.client_id !== client.id) {
    throw buildError("pickup_site_id does not belong to client_id");
  }

  if (dropoffSite && client && dropoffSite.client_id !== client.id) {
    throw buildError("dropoff_site_id does not belong to client_id");
  }

  if (payload.distance_km !== undefined && distance_km === null) {
    throw buildError("distance_km must be a valid number");
  }

  return prisma.routes.create({
    data: {
      company_id,
      code: code ? upper(code) : null,
      name,
      client_id: client?.id || null,
      pickup_site_id: pickupSite?.id || null,
      dropoff_site_id: dropoffSite?.id || null,
      origin_label,
      destination_label,
      distance_km,
      is_active,
      notes,
    },
    include: {
      clients: { select: { id: true, name: true } },
      pickup_site: { select: { id: true, name: true } },
      dropoff_site: { select: { id: true, name: true } },
    },
  });
}

async function updateRoute(id, payload = {}, company_id) {
  requireCompanyId(company_id);
  const existing = await getRouteById(id, company_id);

  const nextClientId =
    payload.client_id !== undefined ? s(payload.client_id) : existing.client_id;
  const nextPickupSiteId =
    payload.pickup_site_id !== undefined ? s(payload.pickup_site_id) : existing.pickup_site_id;
  const nextDropoffSiteId =
    payload.dropoff_site_id !== undefined ? s(payload.dropoff_site_id) : existing.dropoff_site_id;

  const client = await ensureClientExists(nextClientId, company_id);
  const pickupSite = await ensureSiteExists(nextPickupSiteId, company_id, "pickup_site_id");
  const dropoffSite = await ensureSiteExists(nextDropoffSiteId, company_id, "dropoff_site_id");

  if (pickupSite && client && pickupSite.client_id !== client.id) {
    throw buildError("pickup_site_id does not belong to client_id");
  }

  if (dropoffSite && client && dropoffSite.client_id !== client.id) {
    throw buildError("dropoff_site_id does not belong to client_id");
  }

  const data = {};

  if (payload.code !== undefined) data.code = s(payload.code) ? upper(payload.code) : null;

  if (payload.name !== undefined) {
    const name = s(payload.name);
    if (!name) throw buildError("name cannot be empty");
    data.name = name;
  }

  if (payload.client_id !== undefined) data.client_id = client?.id || null;
  if (payload.pickup_site_id !== undefined) data.pickup_site_id = pickupSite?.id || null;
  if (payload.dropoff_site_id !== undefined) data.dropoff_site_id = dropoffSite?.id || null;
  if (payload.origin_label !== undefined) data.origin_label = s(payload.origin_label);
  if (payload.destination_label !== undefined) data.destination_label = s(payload.destination_label);

  if (payload.distance_km !== undefined) {
    const distance_km = toNum(payload.distance_km);
    if (distance_km === null && payload.distance_km !== null && payload.distance_km !== "") {
      throw buildError("distance_km must be a valid number");
    }
    data.distance_km = distance_km;
  }

  if (typeof payload.is_active === "boolean") data.is_active = payload.is_active;
  if (payload.notes !== undefined) data.notes = s(payload.notes);

  return prisma.routes.update({
    where: { id: existing.id },
    data,
    include: {
      clients: { select: { id: true, name: true } },
      pickup_site: { select: { id: true, name: true } },
      dropoff_site: { select: { id: true, name: true } },
    },
  });
}

async function toggleRoute(id, company_id) {
  requireCompanyId(company_id);
  const row = await getRouteById(id, company_id);

  return prisma.routes.update({
    where: { id: row.id },
    data: { is_active: !row.is_active },
    include: {
      clients: { select: { id: true, name: true } },
      pickup_site: { select: { id: true, name: true } },
      dropoff_site: { select: { id: true, name: true } },
    },
  });
}

// =======================
// Pricing Rules
// =======================
function buildPricingRuleInclude() {
  return {
    clients: { select: { id: true, name: true } },
    client_contracts: { select: { id: true, contract_no: true, status: true } },
    routes: { select: { id: true, code: true, name: true } },
    pickup_site: { select: { id: true, name: true } },
    dropoff_site: { select: { id: true, name: true } },
    from_zone: { select: { id: true, name: true, code: true } },
    to_zone: { select: { id: true, name: true, code: true } },
    vehicle_classes: { select: { id: true, code: true, name: true } },
    cargo_types: { select: { id: true, code: true, name: true } },
  };
}

function buildPricingRuleWhere(query = {}) {
  const company_id = requireCompanyId(query.company_id);
  const where = { company_id };

  const contract_id = s(query.contract_id);
  const client_id = s(query.client_id);
  const route_id = s(query.route_id);
  const pickup_site_id = s(query.pickup_site_id);
  const dropoff_site_id = s(query.dropoff_site_id);
  const vehicle_class_id = s(query.vehicle_class_id);
  const cargo_type_id = s(query.cargo_type_id);
  const trip_type = s(query.trip_type);
  const is_active = toBool(query.is_active, null);
  const q = s(query.q);

  if (contract_id) where.contract_id = contract_id;
  if (client_id) where.client_id = client_id;
  if (route_id) where.route_id = route_id;
  if (pickup_site_id) where.pickup_site_id = pickup_site_id;
  if (dropoff_site_id) where.dropoff_site_id = dropoff_site_id;
  if (vehicle_class_id) where.vehicle_class_id = vehicle_class_id;
  if (cargo_type_id) where.cargo_type_id = cargo_type_id;
  if (trip_type) where.trip_type = buildTripTypeValue(trip_type);
  if (typeof is_active === "boolean") where.is_active = is_active;

  if (q) {
    where.OR = [
      { notes: { contains: q, mode: "insensitive" } },
      { clients: { name: { contains: q, mode: "insensitive" } } },
      { client_contracts: { contract_no: { contains: q, mode: "insensitive" } } },
    ];
  }

  return where;
}

async function listPricingRules(query = {}) {
  const { page, pageSize, skip } = parsePaging(query);
  const where = buildPricingRuleWhere(query);

  const [items, total] = await Promise.all([
    prisma.contract_pricing_rules.findMany({
      where,
      orderBy: [{ priority: "asc" }, { created_at: "desc" }],
      skip,
      take: pageSize,
      include: buildPricingRuleInclude(),
    }),
    prisma.contract_pricing_rules.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    pages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

async function getPricingRuleById(id, company_id) {
  requireCompanyId(company_id);
  if (!isUuid(id)) throw buildError("Invalid pricing rule id");

  const row = await prisma.contract_pricing_rules.findFirst({
    where: {
      id,
      company_id,
    },
    include: buildPricingRuleInclude(),
  });

  if (!row) throw buildError("Pricing rule not found", 404);
  return row;
}

async function validatePricingRulePayload(payload = {}, company_id, existing = null) {
  requireCompanyId(company_id);

  const nextContractId =
    payload.contract_id !== undefined ? s(payload.contract_id) : existing?.contract_id || null;

  const nextClientId =
    payload.client_id !== undefined ? s(payload.client_id) : existing?.client_id || null;

  if (!nextContractId) throw buildError("contract_id is required");
  if (!nextClientId) throw buildError("client_id is required");

  const contract = await ensureContractExists(nextContractId, company_id);
  const client = await ensureClientExists(nextClientId, company_id);

  if (contract.client_id !== client.id) {
    throw buildError("contract_id does not belong to client_id");
  }

  const routeId =
    payload.route_id !== undefined ? s(payload.route_id) : existing?.route_id || null;

  const pickupSiteId =
    payload.pickup_site_id !== undefined
      ? s(payload.pickup_site_id)
      : existing?.pickup_site_id || null;

  const dropoffSiteId =
    payload.dropoff_site_id !== undefined
      ? s(payload.dropoff_site_id)
      : existing?.dropoff_site_id || null;

  const fromZoneId =
    payload.from_zone_id !== undefined
      ? s(payload.from_zone_id)
      : existing?.from_zone_id || null;

  const toZoneId =
    payload.to_zone_id !== undefined ? s(payload.to_zone_id) : existing?.to_zone_id || null;

  const vehicleClassId =
    payload.vehicle_class_id !== undefined
      ? s(payload.vehicle_class_id)
      : existing?.vehicle_class_id || null;

  const cargoTypeId =
    payload.cargo_type_id !== undefined
      ? s(payload.cargo_type_id)
      : existing?.cargo_type_id || null;

  const route = await ensureRouteExists(routeId, company_id);
  const pickupSite = await ensureSiteExists(pickupSiteId, company_id, "pickup_site_id");
  const dropoffSite = await ensureSiteExists(dropoffSiteId, company_id, "dropoff_site_id");
  const fromZone = await ensureZoneExists(fromZoneId, company_id, "from_zone_id");
  const toZone = await ensureZoneExists(toZoneId, company_id, "to_zone_id");
  const vehicleClass = await ensureVehicleClassExists(vehicleClassId, company_id);
  const cargoType = await ensureCargoTypeExists(cargoTypeId, company_id);

  if (route && route.client_id && route.client_id !== client.id) {
    throw buildError("route_id does not belong to client_id");
  }

  if (pickupSite && pickupSite.client_id !== client.id) {
    throw buildError("pickup_site_id does not belong to client_id");
  }

  if (dropoffSite && dropoffSite.client_id !== client.id) {
    throw buildError("dropoff_site_id does not belong to client_id");
  }

  const trip_type =
    payload.trip_type !== undefined
      ? buildTripTypeValue(payload.trip_type)
      : existing?.trip_type || null;

  const min_weight =
    payload.min_weight !== undefined ? toNum(payload.min_weight) : existing?.min_weight ?? null;

  const max_weight =
    payload.max_weight !== undefined ? toNum(payload.max_weight) : existing?.max_weight ?? null;

  const base_price =
    payload.base_price !== undefined ? toNum(payload.base_price) : toNum(existing?.base_price);

  const price_per_ton =
    payload.price_per_ton !== undefined
      ? toNum(payload.price_per_ton)
      : existing?.price_per_ton ?? null;

  const price_per_km =
    payload.price_per_km !== undefined
      ? toNum(payload.price_per_km)
      : existing?.price_per_km ?? null;

  const priority =
    payload.priority !== undefined ? toInt(payload.priority) : existing?.priority ?? 100;

  if (base_price === null || base_price < 0) {
    throw buildError("base_price is required and must be >= 0");
  }

  if (min_weight !== null && min_weight < 0) throw buildError("min_weight must be >= 0");
  if (max_weight !== null && max_weight < 0) throw buildError("max_weight must be >= 0");

  if (min_weight !== null && max_weight !== null && min_weight > max_weight) {
    throw buildError("min_weight cannot be greater than max_weight");
  }

  if (price_per_ton !== null && price_per_ton < 0) {
    throw buildError("price_per_ton must be >= 0");
  }

  if (price_per_km !== null && price_per_km < 0) {
    throw buildError("price_per_km must be >= 0");
  }

  if (priority === null || priority < 0) {
    throw buildError("priority must be a non-negative integer");
  }

  const effective_from =
    payload.effective_from !== undefined
      ? toDateOrNull(payload.effective_from)
      : existing?.effective_from || null;

  const effective_to =
    payload.effective_to !== undefined
      ? toDateOrNull(payload.effective_to)
      : existing?.effective_to || null;

  if (
    payload.effective_from !== undefined &&
    payload.effective_from !== null &&
    payload.effective_from !== "" &&
    !effective_from
  ) {
    throw buildError("Invalid effective_from");
  }

  if (
    payload.effective_to !== undefined &&
    payload.effective_to !== null &&
    payload.effective_to !== "" &&
    !effective_to
  ) {
    throw buildError("Invalid effective_to");
  }

  if (effective_from && effective_to && effective_from > effective_to) {
    throw buildError("effective_from cannot be after effective_to");
  }

  return {
    contract,
    client,
    route,
    pickupSite,
    dropoffSite,
    fromZone,
    toZone,
    vehicleClass,
    cargoType,
    values: {
      trip_type,
      min_weight,
      max_weight,
      base_price,
      currency: s(payload.currency) || existing?.currency || contract.currency || "EGP",
      price_per_ton,
      price_per_km,
      priority,
      effective_from,
      effective_to,
      is_active:
        typeof payload.is_active === "boolean"
          ? payload.is_active
          : existing?.is_active ?? true,
      notes: payload.notes !== undefined ? s(payload.notes) : existing?.notes || null,
    },
  };
}

async function createPricingRule(payload = {}) {
  const company_id = requireCompanyId(payload.company_id);
  const normalized = await validatePricingRulePayload(payload, company_id);

  return prisma.contract_pricing_rules.create({
    data: {
      company_id,
      contract_id: normalized.contract.id,
      client_id: normalized.client.id,
      route_id: normalized.route?.id || null,
      pickup_site_id: normalized.pickupSite?.id || null,
      dropoff_site_id: normalized.dropoffSite?.id || null,
      from_zone_id: normalized.fromZone?.id || null,
      to_zone_id: normalized.toZone?.id || null,
      vehicle_class_id: normalized.vehicleClass?.id || null,
      cargo_type_id: normalized.cargoType?.id || null,

      trip_type: normalized.values.trip_type,
      min_weight: normalized.values.min_weight,
      max_weight: normalized.values.max_weight,
      base_price: normalized.values.base_price,
      currency: normalized.values.currency,
      price_per_ton: normalized.values.price_per_ton,
      price_per_km: normalized.values.price_per_km,
      priority: normalized.values.priority,
      effective_from: normalized.values.effective_from,
      effective_to: normalized.values.effective_to,
      is_active: normalized.values.is_active,
      notes: normalized.values.notes,
    },
    include: buildPricingRuleInclude(),
  });
}

async function updatePricingRule(id, payload = {}, company_id) {
  requireCompanyId(company_id);
  const existing = await getPricingRuleById(id, company_id);
  const normalized = await validatePricingRulePayload(payload, company_id, existing);

  return prisma.contract_pricing_rules.update({
    where: { id: existing.id },
    data: {
      contract_id: normalized.contract.id,
      client_id: normalized.client.id,
      route_id: normalized.route?.id || null,
      pickup_site_id: normalized.pickupSite?.id || null,
      dropoff_site_id: normalized.dropoffSite?.id || null,
      from_zone_id: normalized.fromZone?.id || null,
      to_zone_id: normalized.toZone?.id || null,
      vehicle_class_id: normalized.vehicleClass?.id || null,
      cargo_type_id: normalized.cargoType?.id || null,

      trip_type: normalized.values.trip_type,
      min_weight: normalized.values.min_weight,
      max_weight: normalized.values.max_weight,
      base_price: normalized.values.base_price,
      currency: normalized.values.currency,
      price_per_ton: normalized.values.price_per_ton,
      price_per_km: normalized.values.price_per_km,
      priority: normalized.values.priority,
      effective_from: normalized.values.effective_from,
      effective_to: normalized.values.effective_to,
      is_active: normalized.values.is_active,
      notes: normalized.values.notes,
    },
    include: buildPricingRuleInclude(),
  });
}

async function togglePricingRule(id, company_id) {
  requireCompanyId(company_id);
  const row = await getPricingRuleById(id, company_id);

  return prisma.contract_pricing_rules.update({
    where: { id: row.id },
    data: { is_active: !row.is_active },
    include: buildPricingRuleInclude(),
  });
}

// =======================
// Simplified Resolver
// =======================
function isRuleEffectiveNow(rule, now = new Date()) {
  if (!rule) return false;
  if (rule.is_active !== true) return false;
  if (rule.effective_from && new Date(rule.effective_from) > now) return false;
  if (rule.effective_to && new Date(rule.effective_to) < now) return false;
  return true;
}

async function resolveTripPrice({ tripId, contractId = null, company_id }) {
  requireCompanyId(company_id);

  if (!isUuid(tripId)) throw buildError("Invalid tripId");
  if (contractId && !isUuid(contractId)) throw buildError("Invalid contractId");

  const trip = await prisma.trips.findFirst({
    where: { id: tripId, company_id },
    select: {
      id: true,
      company_id: true,
      client_id: true,
      contract_id: true,
      site_id: true,
      trip_type: true,
      cargo_weight: true,
      agreed_revenue: true,
      revenue_currency: true,
      client: { select: { id: true, name: true } },
      contract: { select: { id: true, contract_no: true, status: true, currency: true, end_date: true } },
      site: { select: { id: true, name: true } },
    },
  });

  if (!trip) throw buildError("Trip not found", 404);

  const selectedContractId = contractId || trip.contract_id || null;
  if (!selectedContractId) {
    throw buildError("Trip has no contract_id. Please assign contract to trip first", 400);
  }

  const contract = await ensureContractExists(selectedContractId, company_id);

  if (contract.client_id !== trip.client_id) {
    throw buildError("Contract does not belong to trip client");
  }

  if (upper(contract.status) !== "ACTIVE") {
    throw buildError("Contract is not ACTIVE");
  }

  if (contract.end_date && new Date(contract.end_date).getTime() < Date.now()) {
    throw buildError("Contract is expired");
  }

  const rules = await prisma.contract_pricing_rules.findMany({
    where: {
      company_id,
      contract_id: contract.id,
      client_id: trip.client_id,
      is_active: true,
    },
    orderBy: [{ priority: "asc" }, { created_at: "desc" }],
    include: buildPricingRuleInclude(),
  });

  const activeRules = rules.filter(isRuleEffectiveNow);

  if (!activeRules.length) {
    return {
      matched: false,
      matched_rules_count: 0,
      resolved_rule: null,
      candidates: [],
      trip: {
        id: trip.id,
        client_id: trip.client_id,
        client_name: trip.client?.name || null,
        contract_id: contract.id,
        contract_no: contract.contract_no || null,
        site_id: trip.site_id || null,
        site_name: trip.site?.name || null,
        trip_type: trip.trip_type || null,
        cargo_weight: trip.cargo_weight || null,
      },
    };
  }

  const winner = activeRules[0];
  const resolved_amount = Number(winner.base_price || 0);

  return {
    matched: true,
    matched_rules_count: activeRules.length,
    resolved_rule: {
      ...winner,
      match_score: 1,
      resolved_amount,
      resolved_currency: winner.currency || contract.currency || "EGP",
    },
    candidates: activeRules.map((x) => ({
      id: x.id,
      priority: x.priority,
      resolved_amount: Number(x.base_price || 0),
      currency: x.currency || contract.currency || "EGP",
      trip_type: x.trip_type,
      base_price: x.base_price,
      min_weight: x.min_weight,
      max_weight: x.max_weight,
      price_per_ton: x.price_per_ton,
      price_per_km: x.price_per_km,
    })),
    trip: {
      id: trip.id,
      client_id: trip.client_id,
      client_name: trip.client?.name || null,
      contract_id: contract.id,
      contract_no: contract.contract_no || null,
      site_id: trip.site_id || null,
      site_name: trip.site?.name || null,
      trip_type: trip.trip_type || null,
      cargo_weight: trip.cargo_weight || null,
    },
  };
}

module.exports = {
  listVehicleClasses,
  getVehicleClassById,
  createVehicleClass,
  updateVehicleClass,
  toggleVehicleClass,

  listCargoTypes,
  getCargoTypeById,
  createCargoType,
  updateCargoType,
  toggleCargoType,

  listZones,
  getZoneById,
  createZone,
  updateZone,
  toggleZone,

  listRoutes,
  getRouteById,
  createRoute,
  updateRoute,
  toggleRoute,

  listPricingRules,
  getPricingRuleById,
  createPricingRule,
  updatePricingRule,
  togglePricingRule,

  resolveTripPrice,
};