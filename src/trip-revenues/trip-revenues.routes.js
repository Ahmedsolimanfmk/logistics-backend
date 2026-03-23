const express = require("express");
const controller = require("./trip-revenues.controller");

const router = express.Router();

// Revenue by trip
router.get("/:tripId/revenue", controller.getByTripId);
router.put("/:tripId/revenue", controller.createOrUpdateRevenue);

// Profitability by trip
router.get("/:tripId/profitability", controller.getProfitability);

module.exports = router;