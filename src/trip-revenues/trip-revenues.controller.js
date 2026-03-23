const tripRevenuesService = require("./trip-revenues.service");

// =======================
// Helpers
// =======================
function getUserId(req) {
  return req.user?.id || req.auth?.id || null;
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
    const { trip_id, amount, currency, source, contract_id, invoice_id, notes } = req.body;

    if (!trip_id) {
      return res.status(400).json({
        success: false,
        message: "trip_id is required",
      });
    }

    if (amount === undefined || amount === null || amount === "") {
      return res.status(400).json({
        success: false,
        message: "amount is required",
      });
    }

    const data = await tripRevenuesService.createOrUpdateRevenue({
      trip_id,
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