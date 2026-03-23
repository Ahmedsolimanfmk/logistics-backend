const vendorsService = require("./vendors.service");

function handleError(res, error) {
  const statusCode = error?.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: error?.message || "Internal server error",
  });
}

async function list(req, res) {
  try {
    const data = await vendorsService.list(req.query);

    return res.json({
      success: true,
      ...data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function options(req, res) {
  try {
    const items = await vendorsService.options();

    return res.json({
      success: true,
      items,
      total: items.length,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getById(req, res) {
  try {
    const { id } = req.params;

    const data = await vendorsService.getById(id);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function create(req, res) {
  try {
    const data = await vendorsService.create(req.body);

    return res.status(201).json({
      success: true,
      message: "Vendor created successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;

    const data = await vendorsService.update(id, req.body);

    return res.json({
      success: true,
      message: "Vendor updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function toggle(req, res) {
  try {
    const { id } = req.params;

    const data = await vendorsService.toggle(id);

    return res.json({
      success: true,
      message: "Vendor status updated successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
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