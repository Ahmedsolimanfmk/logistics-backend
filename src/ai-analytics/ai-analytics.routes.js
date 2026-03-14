const express = require("express");
const controller = require("./ai-analytics.controller");

const router = express.Router();

router.post("/query", controller.queryAiAnalytics);

/**
 * مهم:
 * الفرونت عندك يطلب /suggested
 * لذلك سنوفر المسارين معًا لتفادي أي تعارض:
 * /suggested
 * /suggestions
 */
router.get("/suggested", controller.getAiSuggestedQuestions);
router.get("/suggestions", controller.getAiSuggestedQuestions);

router.get("/insights", controller.getAiInsights);

module.exports = router;