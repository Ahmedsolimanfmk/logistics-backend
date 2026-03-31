const express = require("express");
const controller = require("./ai-analytics.controller");

const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");
const {
  requireCompanyActive,
  requireCompanyFeature,
} = require("../companies/company-access.middleware");

const router = express.Router();

/**
 * حماية كل مسارات AI Analytics
 * حتى يكون req.user و req.companyId متوفرين دائمًا
 */
router.use(authRequired);
router.use(requireCompany);
router.use(requireCompanyActive);

/**
 * Query
 */
router.post(
  "/query",
  requireCompanyFeature("analytics.access"),
  controller.queryAiAnalytics
);

/**
 * مهم:
 * الفرونت عندك يطلب /suggested
 * لذلك نوفر المسارين معًا:
 * /suggested
 * /suggestions
 */
router.get(
  "/suggested",
  requireCompanyFeature("analytics.access"),
  controller.getAiSuggestedQuestions
);

router.get(
  "/suggestions",
  requireCompanyFeature("analytics.access"),
  controller.getAiSuggestedQuestions
);

/**
 * Insights
 */
router.get(
  "/insights",
  requireCompanyFeature("analytics.access"),
  controller.getAiInsights
);

module.exports = router;