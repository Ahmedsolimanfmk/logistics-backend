const { resolveTimeRange } = require("./analytics.time");
const { buildScopeFilters } = require("./analytics.filters");
const financeAnalytics = require("./finance.analytics");

async function getFinanceExpenseSummary({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);

  return financeAnalytics.getExpenseSummary({
    range,
    scope,
  });
}

module.exports = {
  getFinanceExpenseSummary,
};