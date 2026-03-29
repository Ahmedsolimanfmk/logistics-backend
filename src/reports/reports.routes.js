const { Router } = require("express");

const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");

const {
  requireCompanyActive,
  requireCompanyFeature,
} = require("../companies/company-access.middleware");

const {
  getTripFinanceReport,
  getSupervisorLedgerReport,
} = require("./reports.controller");

const router = Router();

router.use(authRequired);
router.use(requireCompany);
router.use(requireCompanyActive);

// Trip finance
router.get(
  "/trips/:tripId/finance",
  requireCompanyFeature("finance.access"),
  getTripFinanceReport
);

// Supervisor ledger
router.get(
  "/supervisors/:supervisorId/ledger",
  requireCompanyFeature("finance.access"),
  requireAdminOrHR,
  getSupervisorLedgerReport
);

module.exports = router;