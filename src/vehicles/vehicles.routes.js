const { Router } = require("express");

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

router.use(authRequired);
router.use(requireCompany);
router.use(requireCompanyActive);

// list
router.get("/", requireCompanyFeature("vehicles.access"), getVehicles);
router.get("/active", requireCompanyFeature("vehicles.access"), getActiveVehicles);

// create (limit!)
router.post(
  "/",
  requireAdminOrHR,
  requireCompanyFeature("vehicles.access"),
  requireCompanyLimit("max_vehicles", async (req) => {
    return require("../prisma").vehicles.count({
      where: { company_id: req.companyId },
    });
  }),
  createVehicle
);

// single
router.get("/:id", requireCompanyFeature("vehicles.access"), getVehicleById);
router.get("/:id/summary", requireCompanyFeature("vehicles.access"), getVehicleSummary);

// update
router.patch("/:id", requireAdminOrHR, updateVehicle);
router.patch("/:id/toggle", requireAdminOrHR, toggleVehicle);
router.delete("/:id", requireAdminOrHR, deleteVehicle);

module.exports = router;