const { Router } = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");
const { requireCompany } = require("../auth/company.middleware");
const { requireCompanyActive } = require("../companies/company-access.middleware");

const {
  getDrivers,
  getActiveDrivers,
  createDriver,
  getDriverById,
  updateDriver,
  setDriverStatus,
  getDriverFinancialSummary,
} = require("./drivers.controller");

const router = Router();

router.use(authRequired);
router.use(requireCompany);
router.use(requireCompanyActive);
router.use(requireAdminOrHR);

// special routes
router.get("/active", getActiveDrivers);
router.patch("/:id/status", setDriverStatus);

// CRUD
router.get("/", getDrivers);
router.post("/", createDriver);

// financial
router.get("/:id/financial-summary", getDriverFinancialSummary);

// normal routes
router.get("/:id", getDriverById);
router.patch("/:id", updateDriver);

module.exports = router;