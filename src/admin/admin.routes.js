const express = require("express");
const router = express.Router();

const { authRequired } = require("../auth/jwt.middleware");
const { isSuperAdmin } = require("../auth/access");

const {
  getSystemStats,
  getCompanies,
  addCompany,
  updateCompany,
  updateFeatures,
  updateSubscription,
  impersonateCompany,
  toggleCompanyStatus,
  getCompanyStats,
  getCompanyById,
  getCompanyPayments,
  addCompanyPayment,
  renderInvoice,
} = require("./admin.controller");

// Protect all routes
router.use(authRequired);

// Verify SUPER_ADMIN
router.use((req, res, next) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({ message: "Super Admin only" });
  }
  next();
});

// =====================
// System Stats
// =====================
router.get("/system-stats", getSystemStats);

// =====================
// Companies
// =====================
router.get("/companies", getCompanies);
router.post("/companies", addCompany);
router.get("/companies/:id", getCompanyById);
router.put("/companies/:id", updateCompany);
router.patch("/companies/:id/toggle-status", toggleCompanyStatus);
router.get("/companies/:id/stats", getCompanyStats);

// =====================
// Company Management (Features, Subscriptions, Payments)
// =====================
router.put("/companies/:id/features", updateFeatures);
router.put("/companies/:id/subscription", updateSubscription);

// Payments
router.get("/companies/:id/payments", getCompanyPayments);
router.post("/companies/:id/payments", addCompanyPayment);
router.get("/companies/:id/payments/:paymentId/invoice", renderInvoice);

// =====================
// Impersonation
// =====================
router.post("/impersonate/:companyId", impersonateCompany);

module.exports = router;