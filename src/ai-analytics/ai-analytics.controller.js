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

module.exports = {
  queryAiAnalytics,
};