// =======================
// src/supervisors/supervisors.routes.js
// =======================

const { Router } = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");

const {
  listSupervisors,
  getSupervisorVehicles,
  assignVehicle,
  unassignVehicle,
} = require("./supervisors.controller");

const router = Router();

// Admin/HR only
router.get("/", authRequired, requireAdminOrHR, listSupervisors);
router.get("/:id/vehicles", authRequired, requireAdminOrHR, getSupervisorVehicles);
router.post("/:id/assign-vehicle", authRequired, requireAdminOrHR, assignVehicle);
router.post("/:id/unassign-vehicle", authRequired, requireAdminOrHR, unassignVehicle);

module.exports = router;
