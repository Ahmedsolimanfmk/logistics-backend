const express = require("express");
const controller = require("./ai-analytics.controller");

const router = express.Router();

router.post("/query", controller.queryAiAnalytics);
router.get("/suggestions", controller.getAiSuggestedQuestions);
router.get("/insights", controller.getAiInsights);

module.exports = router;