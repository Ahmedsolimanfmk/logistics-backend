const { Router } = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");
const { requireCompany } = require("../auth/company.middleware");
const { requireCompanyActive, requireCompanyFeature } = require("../companies/company-access.middleware");

const {
  assignDriver,
  getActiveAssignments,
  unassignDriver,
  addCustodyItem,
  returnCustodyItem
} = require("./assignments.controller");

const router = Router();

router.use(authRequired);
router.use(requireCompany);
router.use(requireCompanyActive);

// List active assignments
router.get("/", requireCompanyFeature("vehicles.access"), getActiveAssignments);

// Assign driver
router.post("/", requireAdminOrHR, requireCompanyFeature("vehicles.access"), assignDriver);

// Unassign driver
router.patch("/:id/unassign", requireAdminOrHR, unassignDriver);

// Add physical custody
router.post("/:assignment_id/custody", requireAdminOrHR, addCustodyItem);

// Return physical custody
router.patch("/custody/:id/return", requireAdminOrHR, returnCustodyItem);

module.exports = router;
