function money(n) {
  return new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

function buildFinanceInsights(data) {
  const insights = [];

  const totalExpense = Number(data?.expenseSummary?.data?.total_expense || 0);
  const expenseTypes = data?.expenseByType?.data?.items || [];

  if (totalExpense > 0) {
    insights.push({
      type: "finance_total_expense",
      level: "info",
      text: `إجمالي المصروفات خلال هذا الشهر هو ${money(totalExpense)} جنيه.`,
    });
  }

  if (expenseTypes.length > 0) {
    const top = expenseTypes[0];
    insights.push({
      type: "finance_top_expense_type",
      level: "info",
      text: `أعلى نوع مصروف خلال هذا الشهر هو "${top.expense_type}" بإجمالي ${money(
        top.total_amount
      )} جنيه.`,
    });
  }

  return insights;
}

function buildArInsights(data) {
  const insights = [];

  const totalOutstanding = Number(
    data?.outstandingSummary?.data?.total_outstanding || 0
  );
  const overdueAmount = Number(data?.outstandingSummary?.data?.overdue_amount || 0);
  const topDebtors = data?.topDebtors?.data?.items || [];

  if (totalOutstanding > 0) {
    insights.push({
      type: "ar_total_outstanding",
      level: overdueAmount > 0 ? "warning" : "info",
      text: `إجمالي مستحقات العملاء الحالية هو ${money(totalOutstanding)} جنيه.`,
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
      text: `أعلى عميل مديونية حاليًا هو "${top.client_name}" بإجمالي ${money(
        top.total_outstanding
      )} جنيه.`,
    });
  }

  return insights;
}

function buildMaintenanceInsights(data) {
  const insights = [];

  const openCount = Number(
    data?.openWorkOrders?.data?.total_open_work_orders || 0
  );
  const costByVehicle = data?.costByVehicle?.data?.items || [];

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
        top.vehicle_name || top.display_name || top.plate_no || "غير محددة"
      }" بإجمالي ${money(top.total_cost || top.total_amount || 0)} جنيه.`,
    });
  }

  return insights;
}

function buildInventoryInsights(data) {
  const insights = [];

  const topIssuedParts = data?.topIssuedParts?.data?.items || [];
  const lowStockItems = data?.lowStockItems?.data?.items || [];

  if (topIssuedParts.length > 0) {
    const top = topIssuedParts[0];
    insights.push({
      type: "inventory_top_issued_part",
      level: "info",
      text: `أكثر صنف تم صرفه هو "${
        top.part_name || top.item_name || top.name || "غير محدد"
      }" بعدد ${Number(top.total_issued_qty || top.issued_qty || top.qty || 0)}.`,
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