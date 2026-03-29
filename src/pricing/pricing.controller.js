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

// resolve
async function resolve(req, res) {
  try {
    const input =
      req.method === "GET" ? req.query : req.body;

    const data = await service.resolveTripPrice({
      ...input,
      company_id: req.companyId,
    });

    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// create
async function create(req, res) {
  try {
    const data = await service.createPricingRule({
      ...req.body,
      company_id: req.companyId,
    });

    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// list
async function list(req, res) {
  try {
    const data = await service.listPricingRules({
      ...req.query,
      company_id: req.companyId,
    });

    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// get by id
async function getById(req, res) {
  try {
    const data = await service.getPricingRuleById(
      req.params.id,
      req.companyId
    );

    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// update
async function update(req, res) {
  try {
    const data = await service.updatePricingRule(
      req.params.id,
      req.body,
      req.companyId
    );

    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// toggle
async function toggle(req, res) {
  try {
    const data = await service.togglePricingRule(
      req.params.id,
      req.companyId
    );

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