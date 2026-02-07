const { Router } = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");

const {
  getVehicles,
  createVehicle,
  getVehicleById,
  updateVehicle,
  toggleVehicle,
  deleteVehicle,
} = require("./vehicles.controller");

const router = Router();

// ✅ GET يسمح للمشرف كمان (authRequired فقط)
// وداخل controller هيحصرها تلقائيًا في عربياته لو FIELD_SUPERVISOR
router.get("/", authRequired, getVehicles);

// باقي العمليات Admin/HR
router.get("/:id", authRequired, requireAdminOrHR, getVehicleById);
router.post("/", authRequired, requireAdminOrHR, createVehicle);
router.patch("/:id", authRequired, requireAdminOrHR, updateVehicle);
router.patch("/:id/toggle", authRequired, requireAdminOrHR, toggleVehicle);
router.delete("/:id", authRequired, requireAdminOrHR, deleteVehicle);

module.exports = router;
