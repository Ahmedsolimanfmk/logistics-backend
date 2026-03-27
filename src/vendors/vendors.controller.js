const service = require("./vendors.service");

// =======================
// Helpers
// =======================
function handleError(res, err) {
  const status = err.statusCode || 500;
  return res.status(status).json({
    message: err.message || "Internal server error",
  });
}

// =======================
// Controllers
// =======================

// GET /vendors
async function list(req, res) {
  try {
    const data = await service.list(req.query);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// GET /vendors/options/list
async function options(req, res) {
  try {
    const data = await service.options();
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// GET /vendors/:id
async function getById(req, res) {
  try {
    const { id } = req.params;
    const data = await service.getById(id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// POST /vendors
async function create(req, res) {
  try {
    const data = await service.create(req.body);
    return res.status(201).json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// PUT /vendors/:id
async function update(req, res) {
  try {
    const { id } = req.params;
    const data = await service.update(id, req.body);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// PATCH /vendors/:id/toggle
async function toggle(req, res) {
  try {
    const { id } = req.params;
    const data = await service.toggle(id);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  list,
  options,
  getById,
  create,
  update,
  toggle,
};