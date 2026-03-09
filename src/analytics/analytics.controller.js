const analyticsService = require("./analytics.service");
const { ok } = require("./analytics.response");

async function getFinanceExpenseSummary(req, res, next) {
  try {
    const result = await analyticsService.getFinanceExpenseSummary({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}
async function getFinanceExpenseByType(req, res, next) {
  try {
    const result = await analyticsService.getFinanceExpenseByType({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}
module.exports = {
  getFinanceExpenseSummary,
  getFinanceExpenseByType,
};