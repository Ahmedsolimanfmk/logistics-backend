const { labelRange } = require("./ai-analytics.time-labels");

function money(n) {
  return new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

function pickItems(result) {
  if (Array.isArray(result?.data?.items)) return result.data.items;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function pickNumber(obj, paths = []) {
  for (const path of paths) {
    let cur = obj;
    let ok = true;

    for (const key of path) {
      if (cur == null || !(key in cur)) {
        ok = false;
        break;
      }
      cur = cur[key];
    }

    if (ok && cur != null) {
      const n = Number(cur);
      if (Number.isFinite(n)) return n;
    }
  }

  return 0;
}

function pushInsight(items, type, level, text) {
  items.push({ type, level, text });
}

function firstItem(items = []) {
  return Array.isArray(items) && items.length ? items[0] : null;
}

function buildFinanceInsights(data = {}) {
  const items = [];

  const expenseSummary = data?.expenseSummary;
  const expenseByType = data?.expenseByType;

  const total = pickNumber(expenseSummary, [
    ["data", "total_expense"],
    ["total_expense"],
    ["data", "total"],
  ]);

  if (total > 0) {
    pushInsight(
      items,
      "finance_total",
      "info",
      `إجمالي المصروفات في ${labelRange("this_month")} هو ${money(total)} جنيه.`
    );
  }

  const topType = firstItem(pickItems(expenseByType));
  if (topType) {
    const name =
      topType?.expense_type ||
      topType?.name ||
      "غير محدد";

    const value = Number(topType?.total_amount || 0);

    pushInsight(
      items,
      "finance_top_type",
      "info",
      `أعلى نوع مصروف هو "${name}" بإجمالي ${money(value)} جنيه.`
    );
  }

  return items;
}

function buildArInsights(data = {}) {
  const items = [];

  const summary = data?.outstandingSummary;

  const total = pickNumber(summary, [
    ["data", "total_outstanding"],
    ["total_outstanding"],
  ]);

  if (total > 0) {
    pushInsight(
      items,
      "ar_total",
      "warning",
      `إجمالي مستحقات العملاء هو ${money(total)} جنيه.`
    );
  }

  return items;
}

function buildMaintenanceInsights(data = {}) {
  const items = [];

  const open = pickNumber(data?.openWorkOrders, [
    ["data", "total"],
    ["count"],
  ]);

  pushInsight(
    items,
    "maintenance_open",
    open > 0 ? "warning" : "info",
    open > 0
      ? `يوجد ${open} أوامر عمل مفتوحة.`
      : "لا توجد أوامر عمل مفتوحة."
  );

  return items;
}

function buildInventoryInsights(data = {}) {
  const items = [];

  const low = pickItems(data?.lowStockItems);

  if (low.length > 0) {
    pushInsight(
      items,
      "inventory_low",
      "warning",
      `يوجد ${low.length} أصناف منخفضة المخزون.`
    );
  }

  return items;
}

function buildTripsInsights(data = {}) {
  const items = [];

  const total = pickNumber(data?.tripsSummary, [
    ["data", "total_trips"],
  ]);

  if (total > 0) {
    pushInsight(
      items,
      "trips_total",
      "info",
      `إجمالي الرحلات هو ${total}.`
    );
  }

  return items;
}

function buildInsightsByContext({ context, data }) {
  const c = String(context || "").toLowerCase();

  const map = {
    finance: buildFinanceInsights,
    ar: buildArInsights,
    maintenance: buildMaintenanceInsights,
    inventory: buildInventoryInsights,
    trips: buildTripsInsights,
  };

  if (map[c]) return map[c](data);

  return [
    ...buildFinanceInsights(data),
    ...buildArInsights(data),
    ...buildMaintenanceInsights(data),
    ...buildInventoryInsights(data),
    ...buildTripsInsights(data),
  ].slice(0, 10);
}

module.exports = {
  buildInsightsByContext,
};