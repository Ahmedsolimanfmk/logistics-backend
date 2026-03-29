const service = require("./companies.service");

function handleError(res, error, fallbackMessage) {
  const status = error?.statusCode || 500;

  return res.status(status).json({
    message: error?.message || fallbackMessage || "Internal server error",
    ...(status >= 500 ? { error: error?.message || "Unknown error" } : {}),
  });
}

async function getCurrentCompany(req, res) {
  try {
    const data = await service.getCurrentCompany(req.companyId);
    return res.json({ data });
  } catch (error) {
    return handleError(res, error, "Failed to fetch current company");
  }
}

async function updateCurrentCompany(req, res) {
  try {
    const data = await service.updateCurrentCompany(req.companyId, req.body || {});
    return res.json({ data });
  } catch (error) {
    return handleError(res, error, "Failed to update company");
  }
}

async function listMembers(req, res) {
  try {
    const items = await service.listCompanyMembers(req.companyId, req.query || {});
    return res.json({ items });
  } catch (error) {
    return handleError(res, error, "Failed to list company members");
  }
}

async function getMemberByUserId(req, res) {
  try {
    const data = await service.getCompanyMember(
      req.companyId,
      String(req.params.userId)
    );
    return res.json({ data });
  } catch (error) {
    return handleError(res, error, "Failed to fetch company member");
  }
}

async function updateMember(req, res) {
  try {
    const data = await service.updateCompanyMember(
      req.companyId,
      String(req.params.userId),
      req.body || {}
    );
    return res.json({ data });
  } catch (error) {
    return handleError(res, error, "Failed to update company member");
  }
}

async function getCurrentSubscription(req, res) {
  try {
    const data = await service.getCurrentSubscription(req.companyId);
    return res.json({ data });
  } catch (error) {
    return handleError(res, error, "Failed to fetch company subscription");
  }
}

async function createSubscription(req, res) {
  try {
    const data = await service.createSubscription(req.companyId, req.body || {});
    return res.status(201).json({ data });
  } catch (error) {
    return handleError(res, error, "Failed to create company subscription");
  }
}

async function listSettings(req, res) {
  try {
    const data = await service.listSettings(req.companyId);
    return res.json(data);
  } catch (error) {
    return handleError(res, error, "Failed to list company settings");
  }
}

async function upsertSetting(req, res) {
  try {
    const data = await service.upsertSetting(req.companyId, req.body || {});
    return res.json({ data });
  } catch (error) {
    return handleError(res, error, "Failed to save company setting");
  }
}

async function deleteSetting(req, res) {
  try {
    const data = await service.deleteSetting(
      req.companyId,
      String(req.params.settingKey)
    );
    return res.json(data);
  } catch (error) {
    return handleError(res, error, "Failed to delete company setting");
  }
}

module.exports = {
  getCurrentCompany,
  updateCurrentCompany,
  listMembers,
  getMemberByUserId,
  updateMember,
  getCurrentSubscription,
  createSubscription,
  listSettings,
  upsertSetting,
  deleteSetting,
};