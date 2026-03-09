const aiAnalyticsService = require("./ai-analytics.service");

async function queryAiAnalytics(req, res, next) {
  try {
    const result = await aiAnalyticsService.queryAiAnalytics({
      user: req.user,
      body: req.body,
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getAiSuggestedQuestions(req, res, next) {
  try {
    const result = await aiAnalyticsService.getAiSuggestedQuestions({
      user: req.user,
      query: req.query,
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getAiInsights(req, res, next) {
  try {
    const result = await aiAnalyticsService.getAiInsights({
      user: req.user,
      query: req.query,
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  queryAiAnalytics,
  getAiSuggestedQuestions,
  getAiInsights,
};