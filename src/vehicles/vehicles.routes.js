const { Router } = require("express");

const prisma = require("../prisma"); // 🔥 مهم

const { authRequired } = require("../auth/jwt.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");
const { requireCompany } = require("../auth/company.middleware");

const {
  requireCompanyActive,
  requireCompanyFeature,
  requireCompanyLimit,
} = require("../companies/company-access.middleware");

const {
  getVehicles,
  getActiveVehicles,
  createVehicle,
  getVehicleById,
  updateVehicle,
  toggleVehicle,
  deleteVehicle,
  getVehicleSummary,
} = require("./vehicles.controller");

const router = Router();

// =====================
// GLOBAL MIDDLEWARE
// =====================
router.use(authRequired);
router.use(requireCompany);
router.use(requireCompanyActive);

// =====================
// LIST
// =====================
router.get("/", requireCompanyFeature("vehicles.access"), getVehicles);
router.get("/active", requireCompanyFeature("vehicles.access"), getActiveVehicles);

// =====================
// CREATE (WITH LIMIT)
// =====================
router.post(
  "/",
  requireAdminOrHR,
  requireCompanyFeature("vehicles.access"),

  // 🔥 FIX هنا
  requireCompanyLimit("max_vehicles", async (req) => {
    return await prisma.vehicle.count({
      where: { company_id: req.companyId },
    });
  }),

  createVehicle
);

// =====================
// SINGLE
// =====================
router.get("/:id", requireCompanyFeature("vehicles.access"), getVehicleById);
router.get("/:id/summary", requireCompanyFeature("vehicles.access"), getVehicleSummary);

// =====================
// UPDATE
// =====================
router.patch("/:id", requireAdminOrHR, updateVehicle);
router.patch("/:id/toggle", requireAdminOrHR, toggleVehicle);
router.delete("/:id", requireAdminOrHR, deleteVehicle);

module.exports = router;