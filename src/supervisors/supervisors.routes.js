const { Router } = require("express");

const { authRequired } = require("../auth/jwt.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");
const { requireCompany } = require("../auth/company.middleware");

const {
  listSupervisors,
  getSupervisorVehicles,
  assignVehicle,
  unassignVehicle,
} = require("./supervisors.controller");

const router = Router();

router.use(authRequired);
router.use(requireCompany);
router.use(requireAdminOrHR);

// list
router.get("/", listSupervisors);

// vehicles
router.get("/:id/vehicles", getSupervisorVehicles);

// assign/unassign
router.post("/:id/assign-vehicle", assignVehicle);
router.post("/:id/unassign-vehicle", unassignVehicle);

module.exports = router;