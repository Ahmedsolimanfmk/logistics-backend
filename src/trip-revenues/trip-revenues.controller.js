const service = require("./trip-revenues.service");

function getAuthUserId(req) {
  return req.user?.sub || req.user?.id || null;
}

function getCompanyId(req) {
  return req.companyId || req.user?.company_id || null;
}

function handleError(res, error, fallbackMessage = "Request failed") {
  return res.status(error?.statusCode || 500).json({
    success: false,
    message: error?.message || fallbackMessage,
  });
}

async function getByTripId(req, res) {
  try {
    const companyId = getCompanyId(req);
    const { tripId } = req.params;

    if (!companyId) {
      return res.status(403).json({ success: false, message: "Company context missing" });
    }

    const data = await service.getByTripId(tripId, companyId);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error, "Failed to fetch trip revenue");
  }
}

async function getRevenueHistoryByTripId(req, res) {
  try {
    const companyId = getCompanyId(req);
    const { tripId } = req.params;

    if (!companyId) {
      return res.status(403).json({ success: false, message: "Company context missing" });
    }

    const items = await service.getRevenueHistoryByTripId(tripId, companyId);

    return res.json({
      success: true,
      items,
    });
  } catch (error) {
    return handleError(res, error, "Failed to fetch trip revenue history");
  }
}

async function createOrUpdateRevenue(req, res) {
  try {
    const companyId = getCompanyId(req);
    const userId = getAuthUserId(req);
    const { tripId } = req.params;

    if (!companyId) {
      return res.status(403).json({ success: false, message: "Company context missing" });
    }

    const data = await service.createOrUpdateRevenue({
      companyId,
      trip_id: tripId,
      entered_by: userId,
      ...(req.body || {}),
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error, "Failed to save trip revenue");
  }
}

async function approveCurrentRevenue(req, res) {
  try {
    const companyId = getCompanyId(req);
    const userId = getAuthUserId(req);
    const { tripId } = req.params;

    if (!companyId) {
      return res.status(403).json({ success: false, message: "Company context missing" });
    }

    const data = await service.approveCurrentRevenue({
      companyId,
      trip_id: tripId,
      approved_by: userId,
      approval_notes: req.body?.approval_notes || req.body?.notes || null,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error, "Failed to approve trip revenue");
  }
}

async function getTripProfitability(req, res) {
  try {
    const companyId = getCompanyId(req);
    const { tripId } = req.params;

    if (!companyId) {
      return res.status(403).json({ success: false, message: "Company context missing" });
    }

    const data = await service.getTripProfitability(tripId, companyId);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error, "Failed to fetch trip profitability");
  }
}

module.exports = {
  getByTripId,
  getRevenueHistoryByTripId,
  createOrUpdateRevenue,
  approveCurrentRevenue,
  getTripProfitability,
};