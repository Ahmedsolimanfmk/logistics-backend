const express = require("express");
const router = express.Router();

const controller = require("./ai-analytics.controller");
const { authRequired } = require("../auth/jwt.middleware");

router.get("/suggested", authRequired, controller.getAiSuggestedQuestions);
router.post("/query", authRequired, controller.queryAiAnalytics);

module.exports = router;