const express = require("express");
const router = express.Router();

const { authRequired } = require("../auth/jwt.middleware");
const { isSuperAdmin } = require("../auth/access");

const {
  getCompanies,
  toggleCompanyStatus,
  getCompanyStats,
} = require("./admin.controller");

// حماية كل routes
router.use(authRequired);

// تأكد إنه Super Admin
router.use((req, res, next) => {
  if (!isSuperAdmin(req)) {
    return res.status(403).json({
      message: "Super Admin only",
    });
  }
  next();
});

// =====================
// Companies
// =====================

router.get("/companies", getCompanies);

router.patch("/companies/:id/toggle-status", toggleCompanyStatus);

router.get("/companies/:id/stats", getCompanyStats);

module.exports = router;