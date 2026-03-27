const express = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const controller = require("./trip-revenues.controller");

const router = express.Router();

// =======================
// Guard helper
// =======================
function mustBeFn(name, fn) {
  if (typeof fn !== "function") {
    throw new TypeError(
      `[trip-revenues.routes] Handler "${name}" is not a function. Check exports.`
    );
  }
  return fn;
}

// =======================
// Bind handlers safely
// =======================
const getByTripId = mustBeFn(
  "getByTripId",
  controller.getByTripId
);

const getRevenueHistoryByTripId = mustBeFn(
  "getRevenueHistoryByTripId",
  controller.getRevenueHistoryByTripId
);

const createOrUpdateRevenue = mustBeFn(
  "createOrUpdateRevenue",
  controller.createOrUpdateRevenue
);

const approveCurrentRevenue = mustBeFn(
  "approveCurrentRevenue",
  controller.approveCurrentRevenue
);

const getTripProfitability = mustBeFn(
  "getTripProfitability",
  controller.getTripProfitability
);

// =======================
// Routes
// =======================
router.use(authRequired);

// Revenue by trip
router.get("/:tripId/revenue", getByTripId);
router.get("/:tripId/revenue/history", getRevenueHistoryByTripId);
router.put("/:tripId/revenue", createOrUpdateRevenue);
router.post("/:tripId/revenue/approve", approveCurrentRevenue);

// Profitability by trip
router.get("/:tripId/profitability", getTripProfitability);

module.exports = router;