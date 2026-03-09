function money(n) {
  return new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function asNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickItems(obj) {
  if (!obj) return [];
  if (Array.isArray(obj?.data?.items)) return obj.data.items;
  if (Array.isArray(obj?.items)) return obj.items;
  if (Array.isArray(obj?.data)) return obj.data;
  return [];
}

function pickValue(obj, paths = []) {
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

    if (ok && cur != null) return cur;
  }

  return undefined;
}

function buildFinanceInsights(data) {
  const insights = [];

  const totalExpense = asNumber(
    pickValue(data?.expenseSummary, [
      ["data", "total_expense"],
      ["total_expense"],
      ["data", "summary", "total_expense"],
      ["summary", "total_expense"],
      ["data", "total"],
      ["total"],
    ])
  );

  const expenseTypes = asArray(
    pickItems(data?.expenseByType)
  );

  if (totalExpense > 0) {
    insights.push({
      type: "finance_total_expense",
      level: "info",
      text: `إجمالي المصروفات خلال هذا الشهر هو ${money(totalExpense)} جنيه.`,
    });
  } else {
    insights.push({
      type: "finance_total_expense",
      level: "info",
      text: "لا توجد مصروفات مسجلة خلال هذا الشهر حتى الآن.",
    });
  }

  if (expenseTypes.length > 0) {
    const top = expenseTypes[0];
    insights.push({
      type: "finance_top_expense_type",
      level: "info",
      text: `أعلى نوع مصروف خلال هذا الشهر هو "${
        top.expense_type || top.type_name || top.name || "غير محدد"
      }" بإجمالي ${money(top.total_amount || top.amount || 0)} جنيه.`,
    });
  } else {
    insights.push({
      type: "finance_top_expense_type",
      level: "info",
      text: "لا توجد بيانات توزيع مصروفات حسب النوع خلال هذا الشهر.",
    });
  }

  return insights;
}

function buildArInsights(data) {
  const insights = [];

  const totalOutstanding = asNumber(
    pickValue(data?.outstandingSummary, [
      ["data", "total_outstanding"],
      ["total_outstanding"],
      ["data", "summary", "total_outstanding"],
      ["summary", "total_outstanding"],
      ["data", "total"],
      ["total"],
    ])
  );

  const overdueAmount = asNumber(
    pickValue(data?.outstandingSummary, [
      ["data", "overdue_amount"],
      ["overdue_amount"],
      ["data", "summary", "overdue_amount"],
      ["summary", "overdue_amount"],
    ])
  );

  const topDebtors = asArray(
    pickItems(data?.topDebtors)
  );

  if (totalOutstanding > 0) {
    insights.push({
      type: "ar_total_outstanding",
      level: overdueAmount > 0 ? "warning" : "info",
      text: `إجمالي مستحقات العملاء الحالية هو ${money(totalOutstanding)} جنيه.`,
    });
  } else {
    insights.push({
      type: "ar_total_outstanding",
      level: "info",
      text: "لا توجد مستحقات عملاء قائمة حاليًا.",
    });
  }

  if (overdueAmount > 0) {
    insights.push({
      type: "ar_overdue_amount",
      level: "warning",
      text: `من إجمالي المستحقات توجد متأخرات بقيمة ${money(overdueAmount)} جنيه تحتاج متابعة.`,
    });
  }

  if (topDebtors.length > 0) {
    const top = topDebtors[0];
    insights.push({
      type: "ar_top_debtor",
      level: "info",
      text: `أعلى عميل مديونية حاليًا هو "${
        top.client_name || top.name || "غير محدد"
      }" بإجمالي ${money(top.total_outstanding || top.amount || 0)} جنيه.`,
    });
  } else {
    insights.push({
      type: "ar_top_debtor",
      level: "info",
      text: "لا توجد بيانات عملاء مديونية للعرض حاليًا.",
    });
  }

  return insights;
}

function buildMaintenanceInsights(data) {
  const insights = [];

  const openCount = asNumber(
    pickValue(data?.openWorkOrders, [
      ["data", "total_open_work_orders"],
      ["total_open_work_orders"],
      ["data", "count"],
      ["count"],
      ["data", "total"],
      ["total"],
    ])
  );

  const costByVehicle = asArray(
    pickItems(data?.costByVehicle)
  );

  if (openCount > 0) {
    insights.push({
      type: "maintenance_open_work_orders",
      level: openCount >= 5 ? "warning" : "info",
      text: `يوجد ${openCount} أوامر عمل مفتوحة حاليًا وتحتاج متابعة.`,
    });
  } else {
    insights.push({
      type: "maintenance_open_work_orders",
      level: "info",
      text: "لا توجد أوامر عمل مفتوحة حاليًا.",
    });
  }

  if (costByVehicle.length > 0) {
    const top = costByVehicle[0];
    insights.push({
      type: "maintenance_top_cost_vehicle",
      level: "info",
      text: `أعلى مركبة من حيث تكلفة الصيانة هي "${
        top.vehicle_name || top.display_name || top.plate_no || top.name || "غير محددة"
      }" بإجمالي ${money(top.total_cost || top.total_amount || top.amount || 0)} جنيه.`,
    });
  } else {
    insights.push({
      type: "maintenance_top_cost_vehicle",
      level: "info",
      text: "لا توجد بيانات تكلفة صيانة للمركبات خلال هذا الشهر.",
    });
  }

  return insights;
}

function buildInventoryInsights(data) {
  const insights = [];

  const topIssuedParts = asArray(
    pickItems(data?.topIssuedParts)
  );

  const lowStockItems = asArray(
    pickItems(data?.lowStockItems)
  );

  if (topIssuedParts.length > 0) {
    const top = topIssuedParts[0];
    insights.push({
      type: "inventory_top_issued_part",
      level: "info",
      text: `أكثر صنف تم صرفه هو "${
        top.part_name || top.item_name || top.name || "غير محدد"
      }" بعدد ${Number(top.total_issued_qty || top.issued_qty || top.qty || 0)}.`,
    });
  } else {
    insights.push({
      type: "inventory_top_issued_part",
      level: "info",
      text: "لا توجد بيانات أصناف مصروفة خلال هذا الشهر.",
    });
  }

  if (lowStockItems.length > 0) {
    const top = lowStockItems[0];
    insights.push({
      type: "inventory_low_stock_items",
      level: "warning",
      text: `يوجد ${lowStockItems.length} أصناف منخفضة المخزون. أقربها للنفاد هو "${
        top.part_name || top.item_name || top.name || "غير محدد"
      }".`,
    });
  } else {
    insights.push({
      type: "inventory_low_stock_items",
      level: "info",
      text: "لا توجد أصناف منخفضة المخزون حاليًا.",
    });
  }

  return insights;
}

function buildInsightsByContext({ context, data }) {
  const c = String(context || "").trim().toLowerCase();

  if (c === "finance") return buildFinanceInsights(data);
  if (c === "ar") return buildArInsights(data);
  if (c === "maintenance") return buildMaintenanceInsights(data);
  if (c === "inventory") return buildInventoryInsights(data);

  return [
    ...buildFinanceInsights(data),
    ...buildArInsights(data),
    ...buildMaintenanceInsights(data),
    ...buildInventoryInsights(data),
  ];
}

module.exports = {
  buildInsightsByContext,
};