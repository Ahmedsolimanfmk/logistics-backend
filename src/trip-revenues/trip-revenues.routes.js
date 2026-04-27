const express = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");
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

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

function requireUuidParam(paramName = "tripId") {
  return (req, res, next) => {
    const v = req.params?.[paramName];
    if (!isUuid(v)) {
      return res.status(404).json({ message: "Not found" });
    }
    return next();
  };
}

// =======================
// Bind handlers safely
// =======================
const getByTripId = mustBeFn("getByTripId", controller.getByTripId);
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
router.use(requireCompany);

// Revenue by trip
router.get("/:tripId/revenue", requireUuidParam("tripId"), getByTripId);
router.get(
  "/:tripId/revenue/history",
  requireUuidParam("tripId"),
  getRevenueHistoryByTripId
);
router.put("/:tripId/revenue", requireUuidParam("tripId"), createOrUpdateRevenue);
router.post(
  "/:tripId/revenue/approve",
  requireUuidParam("tripId"),
  approveCurrentRevenue
);

// Profitability by trip
router.get(
  "/:tripId/profitability",
  requireUuidParam("tripId"),
  getTripProfitability
);

module.exports = router;