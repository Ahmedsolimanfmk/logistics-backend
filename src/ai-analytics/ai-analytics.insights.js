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

function percentDelta(current, previous) {
  const c = Number(current || 0);
  const p = Number(previous || 0);

  if (p === 0) {
    if (c === 0) return 0;
    return 100;
  }

  return ((c - p) / p) * 100;
}

function levelByMagnitude(deltaAbs) {
  if (deltaAbs >= 40) return "warning";
  if (deltaAbs >= 20) return "info";
  return "info";
}

function buildFinanceInsights(data = {}) {
  const items = [];

  const expenseSummary = data?.expenseSummary;
  const expenseByType = data?.expenseByType;
  const expenseSummaryLastMonth = data?.expenseSummaryLastMonth;

  const currentTotal = pickNumber(expenseSummary, [
    ["data", "total_expense"],
    ["total_expense"],
    ["data", "total"],
    ["total"],
  ]);

  const lastTotal = pickNumber(expenseSummaryLastMonth, [
    ["data", "total_expense"],
    ["total_expense"],
    ["data", "total"],
    ["total"],
  ]);

  if (currentTotal > 0) {
    items.push({
      type: "finance_total_expense",
      level: "info",
      text: `إجمالي المصروفات في ${labelRange("this_month")} هو ${money(currentTotal)} جنيه.`,
    });
  }

  if (currentTotal > 0 || lastTotal > 0) {
    const delta = percentDelta(currentTotal, lastTotal);
    const absDelta = Math.abs(delta);

    if (absDelta >= 10) {
      items.push({
        type: "finance_vs_last_month",
        level: levelByMagnitude(absDelta),
        text:
          delta >= 0
            ? `المصروفات ارتفعت بنسبة ${money(absDelta)}% مقارنة بالشهر الماضي.`
            : `المصروفات انخفضت بنسبة ${money(absDelta)}% مقارنة بالشهر الماضي.`,
      });
    }
  }

  const expenseTypes = pickItems(expenseByType);
  if (expenseTypes.length > 0) {
    const top = expenseTypes[0];
    const name = top?.expense_type || top?.type_name || top?.name || "غير محدد";
    const value = Number(top?.total_amount || top?.amount || 0);

    items.push({
      type: "finance_top_expense_type",
      level: "info",
      text: `أعلى نوع مصروف هذا الشهر هو "${name}" بإجمالي ${money(value)} جنيه.`,
    });
  }

  return items;
}

function buildArInsights(data = {}) {
  const items = [];

  const outstandingSummary = data?.outstandingSummary;
  const topDebtors = data?.topDebtors;

  const totalOutstanding = pickNumber(outstandingSummary, [
    ["data", "total_outstanding"],
    ["total_outstanding"],
    ["data", "total"],
    ["total"],
  ]);

  const overdueAmount = pickNumber(outstandingSummary, [
    ["data", "overdue_amount"],
    ["overdue_amount"],
  ]);

  if (totalOutstanding > 0) {
    items.push({
      type: "ar_total_outstanding",
      level: overdueAmount > 0 ? "warning" : "info",
      text: `إجمالي مستحقات العملاء حاليًا هو ${money(totalOutstanding)} جنيه، منها ${money(overdueAmount)} متأخرات.`,
    });
  }

  const debtors = pickItems(topDebtors);
  if (debtors.length > 0) {
    const top = debtors[0];
    const name = top?.client_name || top?.name || "غير محدد";
    const value = Number(top?.total_outstanding || top?.amount || 0);

    items.push({
      type: "ar_top_debtor",
      level: value > 0 ? "warning" : "info",
      text: `أعلى عميل مديونية حاليًا هو "${name}" بإجمالي ${money(value)} جنيه.`,
    });
  }

  return items;
}

function buildMaintenanceInsights(data = {}) {
  const items = [];

  const openWorkOrders = data?.openWorkOrders;
  const costByVehicle = data?.costByVehicle;

  const totalOpen = pickNumber(openWorkOrders, [
    ["data", "total_open_work_orders"],
    ["total_open_work_orders"],
    ["data", "count"],
    ["count"],
    ["data", "total"],
    ["total"],
  ]);

  items.push({
    type: "maintenance_open_work_orders",
    level: totalOpen > 0 ? "warning" : "info",
    text:
      totalOpen > 0
        ? `يوجد ${Number(totalOpen)} أوامر عمل مفتوحة حاليًا.`
        : "لا توجد أوامر عمل مفتوحة حاليًا.",
  });

  const vehicles = pickItems(costByVehicle);
  if (vehicles.length > 0) {
    const top = vehicles[0];
    const vehicleName =
      top?.vehicle_name || top?.display_name || top?.plate_no || top?.name || "غير محددة";
    const totalCost = Number(top?.total_cost || top?.total_amount || top?.amount || 0);

    items.push({
      type: "maintenance_top_vehicle_cost",
      level: totalCost > 0 ? "info" : "info",
      text: `أعلى مركبة تكلفة صيانة هذا الشهر هي "${vehicleName}" بإجمالي ${money(totalCost)} جنيه.`,
    });
  }

  return items;
}

function buildInventoryInsights(data = {}) {
  const items = [];

  const topIssuedParts = data?.topIssuedParts;
  const lowStockItems = data?.lowStockItems;

  const issued = pickItems(topIssuedParts);
  if (issued.length > 0) {
    const top = issued[0];
    const name = top?.part_name || top?.item_name || top?.name || "غير محدد";
    const qty = Number(top?.total_issued_qty || top?.issued_qty || top?.qty || 0);

    items.push({
      type: "inventory_top_issued_part",
      level: "info",
      text: `أكثر صنف صرفًا هذا الشهر هو "${name}" بعدد ${qty}.`,
    });
  }

  const lowStock = pickItems(lowStockItems);
  if (lowStock.length > 0) {
    items.push({
      type: "inventory_low_stock_count",
      level: lowStock.length >= 5 ? "warning" : "info",
      text: `يوجد ${lowStock.length} أصناف منخفضة المخزون حاليًا.`,
    });

    const first = lowStock[0];
    const firstName =
      first?.part_name || first?.item_name || first?.name || "غير محدد";

    items.push({
      type: "inventory_low_stock_top",
      level: "warning",
      text: `أقرب صنف للنفاد حاليًا هو "${firstName}".`,
    });
  } else {
    items.push({
      type: "inventory_low_stock_none",
      level: "info",
      text: "لا توجد أصناف منخفضة المخزون حاليًا.",
    });
  }

  return items;
}

function buildInsightsByContext({ context, data }) {
  const c = String(context || "").trim().toLowerCase();

  if (c === "finance") {
    return buildFinanceInsights(data);
  }

  if (c === "ar") {
    return buildArInsights(data);
  }

  if (c === "maintenance") {
    return buildMaintenanceInsights(data);
  }

  if (c === "inventory") {
    return buildInventoryInsights(data);
  }

  return [
    ...buildFinanceInsights(data),
    ...buildArInsights(data),
    ...buildMaintenanceInsights(data),
    ...buildInventoryInsights(data),
  ].slice(0, 10);
}

module.exports = {
  buildInsightsByContext,
};