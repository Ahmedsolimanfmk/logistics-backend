const service = require("./pricing.service");

// =======================
// Helpers
// =======================
function handleError(res, err) {
  const status = err.statusCode || err.status || 500;
  return res.status(status).json({
    message: err.message || "Internal server error",
    ...(err.details ? { details: err.details } : {}),
  });
}

// =======================
// Controllers
// =======================

// POST/GET /pricing/resolve
async function resolve(req, res) {
  try {
    const input =
      req.method === "GET" ? req.query : req.body;

    const data = await service.resolveTripPrice(input);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// POST /pricing
async function create(req, res) {
  try {
    const data = await service.createPricingRule(req.body);
    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// GET /pricing
async function list(req, res) {
  try {
    const data = await service.listPricingRules(req.query);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// GET /pricing/:id
async function getById(req, res) {
  try {
    const data = await service.getPricingRuleById(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// PATCH /pricing/:id
async function update(req, res) {
  try {
    const data = await service.updatePricingRule(
      req.params.id,
      req.body
    );
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// PATCH /pricing/:id/toggle
async function toggle(req, res) {
  try {
    const data = await service.togglePricingRule(req.params.id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  resolve,
  create,
  list,
  getById,
  update,
  toggle,
};