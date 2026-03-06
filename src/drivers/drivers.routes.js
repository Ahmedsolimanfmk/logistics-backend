// =======================
// src/drivers/drivers.routes.js
// FINAL: protect all routes + keep /active and /:id/status before /:id
// =======================

const { Router } = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");

const {
  getDrivers,
  getActiveDrivers,
  createDriver,
  getDriverById,
  updateDriver,
  setDriverStatus,
} = require("./drivers.controller");

const router = Router();

// ✅ Apply auth + role once for all drivers routes
router.use(authRequired, requireAdminOrHR);

// ✅ Special routes must come before ":id"
router.get("/active", getActiveDrivers);
router.patch("/:id/status", setDriverStatus);

// CRUD
router.get("/", getDrivers);
router.post("/", createDriver);
router.get("/:id", getDriverById);
router.patch("/:id", updateDriver);
router.get("/:id/financial-summary", getDriverFinancialSummary);

module.exports = router;