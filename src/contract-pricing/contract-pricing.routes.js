const express = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");
const controller = require("./contract-pricing.controller");

const router = express.Router();

router.use(authRequired);
router.use(requireCompany); // 🔥 مهم جدا

// =======================
// Vehicle Classes
// =======================
router.get("/vehicle-classes", controller.listVehicleClasses);
router.get("/vehicle-classes/:id", controller.getVehicleClassById);
router.post("/vehicle-classes", controller.createVehicleClass);
router.put("/vehicle-classes/:id", controller.updateVehicleClass);
router.patch("/vehicle-classes/:id/toggle", controller.toggleVehicleClass);

// =======================
// Cargo Types
// =======================
router.get("/cargo-types", controller.listCargoTypes);
router.get("/cargo-types/:id", controller.getCargoTypeById);
router.post("/cargo-types", controller.createCargoType);
router.put("/cargo-types/:id", controller.updateCargoType);
router.patch("/cargo-types/:id/toggle", controller.toggleCargoType);

// =======================
// Zones
// =======================
router.get("/zones", controller.listZones);
router.get("/zones/:id", controller.getZoneById);
router.post("/zones", controller.createZone);
router.put("/zones/:id", controller.updateZone);
router.patch("/zones/:id/toggle", controller.toggleZone);

// =======================
// Routes Master
// =======================
router.get("/routes", controller.listRoutes);
router.get("/routes/:id", controller.getRouteById);
router.post("/routes", controller.createRoute);
router.put("/routes/:id", controller.updateRoute);
router.patch("/routes/:id/toggle", controller.toggleRoute);

// =======================
// Pricing Rules
// =======================
router.get("/rules", controller.listPricingRules);
router.get("/rules/:id", controller.getPricingRuleById);
router.post("/rules", controller.createPricingRule);
router.put("/rules/:id", controller.updatePricingRule);
router.patch("/rules/:id/toggle", controller.togglePricingRule);

// =======================
// Resolver
// =======================
router.post("/resolve-trip-price/:tripId", controller.resolveTripPrice);

module.exports = router;