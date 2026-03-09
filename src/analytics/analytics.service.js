const { resolveTimeRange } = require("./analytics.time");
const { buildScopeFilters } = require("./analytics.filters");
const financeAnalytics = require("./finance.analytics");
const arAnalytics = require("./ar.analytics");

async function getFinanceExpenseSummary({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);

  return financeAnalytics.getExpenseSummary({
    range,
    scope,
  });
}
async function getFinanceExpenseByType({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);

  return financeAnalytics.getExpenseByType({
    range,
    scope,
  });
}
async function getArOutstandingSummary({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);

  return arAnalytics.getOutstandingSummary({
    range,
    scope,
  });
}
module.exports = {
  getFinanceExpenseSummary,
  getFinanceExpenseByType,
  getArOutstandingSummary,
};