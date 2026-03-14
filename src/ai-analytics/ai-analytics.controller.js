const aiAnalyticsService = require("./ai-analytics.service");

async function queryAiAnalytics(req, res, next) {
  try {
    const result = await aiAnalyticsService.queryAiAnalytics({
      user: req.user,
      body: req.body,
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getAiSuggestedQuestions(req, res, next) {
  try {
    const result = await aiAnalyticsService.getAiSuggestedQuestions({
      user: req.user,
      query: req.query,
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getAiInsights(req, res, next) {
  try {
    const result = await aiAnalyticsService.getAiInsights({
      user: req.user,
      query: req.query,
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  queryAiAnalytics,
  getAiSuggestedQuestions,
  getAiInsights,
};