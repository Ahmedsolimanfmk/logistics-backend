const tripRevenuesService = require("./trip-revenues.service");
const {
  canManageTripRevenue,
  canViewTripProfitability,
} = require("../auth/access");

// =======================
// Helpers
// =======================
function getUserId(req) {
  return req.user?.id || req.user?.sub || req.auth?.id || null;
}

function handleError(res, error) {
  const statusCode = error?.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message: error?.message || "Internal server error",
  });
}

// =======================
// Controller
// =======================
async function getByTripId(req, res) {
  try {
    if (!canManageTripRevenue(req)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const { tripId } = req.params;

    if (!tripId) {
      return res.status(400).json({
        success: false,
        message: "tripId is required",
      });
    }

    const data = await tripRevenuesService.getByTripId(tripId);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function createOrUpdateRevenue(req, res) {
  try {
    if (!canManageTripRevenue(req)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const { tripId } = req.params;
    const { amount, currency, source, contract_id, invoice_id, notes } = req.body || {};

    if (!tripId) {
      return res.status(400).json({
        success: false,
        message: "tripId is required",
      });
    }

    if (amount === undefined || amount === null || amount === "") {
      return res.status(400).json({
        success: false,
        message: "amount is required",
      });
    }

    const data = await tripRevenuesService.createOrUpdateRevenue({
      trip_id: tripId,
      amount,
      currency,
      source,
      contract_id,
      invoice_id,
      notes,
      entered_by: getUserId(req),
    });

    return res.json({
      success: true,
      message: "Trip revenue saved successfully",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getProfitability(req, res) {
  try {
    if (!canViewTripProfitability(req)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const { tripId } = req.params;

    if (!tripId) {
      return res.status(400).json({
        success: false,
        message: "tripId is required",
      });
    }

    const data = await tripRevenuesService.getTripProfitability(tripId);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = {
  getByTripId,
  createOrUpdateRevenue,
  getProfitability,
};