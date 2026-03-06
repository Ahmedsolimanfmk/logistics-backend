// =======================
// src/vehicles/vehicles.routes.js
// =======================

const { Router } = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");

const {
  getActiveVehicles,
  getVehicles,
  createVehicle,
  getVehicleById,
  getVehicleSummary, // ✅ NEW
  updateVehicle,
  toggleVehicle,
  deleteVehicle,
} = require("./vehicles.controller");

const router = Router();

// special routes
router.get("/active", authRequired, getActiveVehicles);

// list
router.get("/", authRequired, getVehicles);

// summary (قبل :id)
router.get("/:id/summary", authRequired, getVehicleSummary);

// single
router.get("/:id", authRequired, requireAdminOrHR, getVehicleById);

// CRUD
router.post("/", authRequired, requireAdminOrHR, createVehicle);
router.patch("/:id", authRequired, requireAdminOrHR, updateVehicle);
router.patch("/:id/toggle", authRequired, requireAdminOrHR, toggleVehicle);
router.delete("/:id", authRequired, requireAdminOrHR, deleteVehicle);

module.exports = router;