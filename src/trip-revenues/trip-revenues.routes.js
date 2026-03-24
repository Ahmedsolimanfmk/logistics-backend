const express = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const controller = require("./trip-revenues.controller");

const router = express.Router();

router.use(authRequired);

// Revenue by trip
router.get("/:tripId/revenue", controller.getByTripId);
router.put("/:tripId/revenue", controller.createOrUpdateRevenue);

// Profitability by trip
router.get("/:tripId/profitability", controller.getProfitability);

module.exports = router;