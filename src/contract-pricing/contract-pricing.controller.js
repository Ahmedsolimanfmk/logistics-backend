const service = require("./contract-pricing.service");

// =======================
// Helpers
// =======================
function roleUpper(role) {
  return String(role || "").trim().toUpperCase();
}

function isManager(req) {
  const role = roleUpper(req.user?.role);
  return ["ADMIN", "CONTRACT_MANAGER"].includes(role);
}

function handleError(res, error) {
  const statusCode = error?.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: error?.message || "Internal server error",
  });
}

function forbid(res) {
  return res.status(403).json({
    success: false,
    message: "Forbidden",
  });
}

// =======================
// Vehicle Classes
// =======================
async function listVehicleClasses(req, res) {
  try {
    const data = await service.listVehicleClasses({
      ...req.query,
      company_id: req.companyId,
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getVehicleClassById(req, res) {
  try {
    const data = await service.getVehicleClassById(
      req.params.id,
      req.companyId
    );
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function createVehicleClass(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.createVehicleClass({
      ...req.body,
      company_id: req.companyId,
    });

    return res.status(201).json({
      success: true,
      message: "Vehicle class created successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateVehicleClass(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.updateVehicleClass(
      req.params.id,
      req.body,
      req.companyId
    );

    return res.json({
      success: true,
      message: "Vehicle class updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function toggleVehicleClass(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.toggleVehicleClass(
      req.params.id,
      req.companyId
    );

    return res.json({
      success: true,
      message: "Vehicle class status updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =======================
// Cargo Types
// =======================
async function listCargoTypes(req, res) {
  try {
    const data = await service.listCargoTypes({
      ...req.query,
      company_id: req.companyId,
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getCargoTypeById(req, res) {
  try {
    const data = await service.getCargoTypeById(
      req.params.id,
      req.companyId
    );
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function createCargoType(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.createCargoType({
      ...req.body,
      company_id: req.companyId,
    });

    return res.status(201).json({
      success: true,
      message: "Cargo type created successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateCargoType(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.updateCargoType(
      req.params.id,
      req.body,
      req.companyId
    );

    return res.json({
      success: true,
      message: "Cargo type updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function toggleCargoType(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.toggleCargoType(
      req.params.id,
      req.companyId
    );

    return res.json({
      success: true,
      message: "Cargo type status updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =======================
// Zones
// =======================
async function listZones(req, res) {
  try {
    const data = await service.listZones({
      ...req.query,
      company_id: req.companyId,
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getZoneById(req, res) {
  try {
    const data = await service.getZoneById(
      req.params.id,
      req.companyId
    );
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function createZone(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.createZone({
      ...req.body,
      company_id: req.companyId,
    });

    return res.status(201).json({
      success: true,
      message: "Zone created successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateZone(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.updateZone(
      req.params.id,
      req.body,
      req.companyId
    );

    return res.json({
      success: true,
      message: "Zone updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function toggleZone(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.toggleZone(
      req.params.id,
      req.companyId
    );

    return res.json({
      success: true,
      message: "Zone status updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =======================
// Routes Master
// =======================
async function listRoutes(req, res) {
  try {
    const data = await service.listRoutes({
      ...req.query,
      company_id: req.companyId,
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getRouteById(req, res) {
  try {
    const data = await service.getRouteById(
      req.params.id,
      req.companyId
    );
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function createRoute(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.createRoute({
      ...req.body,
      company_id: req.companyId,
    });

    return res.status(201).json({
      success: true,
      message: "Route created successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateRoute(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.updateRoute(
      req.params.id,
      req.body,
      req.companyId
    );

    return res.json({
      success: true,
      message: "Route updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function toggleRoute(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.toggleRoute(
      req.params.id,
      req.companyId
    );

    return res.json({
      success: true,
      message: "Route status updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =======================
// Pricing Rules
// =======================
async function listPricingRules(req, res) {
  try {
    const data = await service.listPricingRules({
      ...req.query,
      company_id: req.companyId,
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getPricingRuleById(req, res) {
  try {
    const data = await service.getPricingRuleById(
      req.params.id,
      req.companyId
    );
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
}

async function createPricingRule(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.createPricingRule({
      ...req.body,
      company_id: req.companyId,
    });

    return res.status(201).json({
      success: true,
      message: "Pricing rule created successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updatePricingRule(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.updatePricingRule(
      req.params.id,
      req.body,
      req.companyId
    );

    return res.json({
      success: true,
      message: "Pricing rule updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function togglePricingRule(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const data = await service.togglePricingRule(
      req.params.id,
      req.companyId
    );

    return res.json({
      success: true,
      message: "Pricing rule status updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// =======================
// Resolver
// =======================
async function resolveTripPrice(req, res) {
  try {
    if (!isManager(req)) return forbid(res);

    const { tripId } = req.params;
    const contractId = req.body?.contract_id || req.query?.contract_id || null;

    const data = await service.resolveTripPrice({
      tripId,
      contractId,
      company_id: req.companyId,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = {
  // vehicle classes
  listVehicleClasses,
  getVehicleClassById,
  createVehicleClass,
  updateVehicleClass,
  toggleVehicleClass,

  // cargo types
  listCargoTypes,
  getCargoTypeById,
  createCargoType,
  updateCargoType,
  toggleCargoType,

  // zones
  listZones,
  getZoneById,
  createZone,
  updateZone,
  toggleZone,

  // routes master
  listRoutes,
  getRouteById,
  createRoute,
  updateRoute,
  toggleRoute,

  // pricing rules
  listPricingRules,
  getPricingRuleById,
  createPricingRule,
  updatePricingRule,
  togglePricingRule,

  // resolver
  resolveTripPrice,
};