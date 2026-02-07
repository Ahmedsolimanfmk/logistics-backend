const { Router } = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");

const {
  getDrivers,
  getActiveDrivers,   // ✅ لازم تكون موجودة
  createDriver,
  getDriverById,
  updateDriver,
  setDriverStatus,
} = require("./drivers.controller");

const router = Router();

// ✅ routes الخاصة لازم تيجي قبل :id
router.get("/active", authRequired, requireAdminOrHR, getActiveDrivers);

// status قبل :id
router.patch("/:id/status", authRequired, requireAdminOrHR, setDriverStatus);

// باقي الـ CRUD
router.get("/", authRequired, requireAdminOrHR, getDrivers);
router.post("/", authRequired, requireAdminOrHR, createDriver);
router.get("/:id", authRequired, requireAdminOrHR, getDriverById);
router.patch("/:id", authRequired, requireAdminOrHR, updateDriver);

module.exports = router;
