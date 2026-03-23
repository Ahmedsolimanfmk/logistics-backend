const express = require("express");
const controller = require("./trip-revenues.controller");

const router = express.Router();

// GET revenue by trip
router.get("/:tripId", controller.getByTripId);

// GET profitability summary by trip
router.get("/:tripId/profitability", controller.getProfitability);

// CREATE or UPDATE trip revenue
router.post("/", controller.createOrUpdateRevenue);

module.exports = router;