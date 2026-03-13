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

function paymentSourceLabel(v) {
  const s = String(v || "").toUpperCase();
  if (s === "ADVANCE") return "العهدة";
  if (s === "COMPANY") return "الشركة";
  return v || "غير محدد";
}

function buildFinanceInsights(data = {}) {
  const items = [];

  const expenseSummary = data?.expenseSummary;
  const expenseByType = data?.expenseByType;
  const expenseSummaryLastMonth = data?.expenseSummaryLastMonth;
  const expenseByVehicle = data?.expenseByVehicle;
  const expenseByPaymentSource = data?.expenseByPaymentSource;
  const topVendors = data?.topVendors;
  const expenseApprovalBreakdown = data?.expenseApprovalBreakdown;

  const currentTotal = pickNumber(expenseSummary, [
    ["data", "total_expense"],
    ["total_expense"],
    ["data", "total"],
    ["total"],
  ]);

  const approvedExpense = pickNumber(expenseSummary, [
    ["data", "approved_expense"],
    ["approved_expense"],
  ]);

  const pendingExpense = pickNumber(expenseSummary, [
    ["data", "pending_expense"],
    ["pending_expense"],
  ]);

  const rejectedExpense = pickNumber(expenseSummary, [
    ["data", "rejected_expense"],
    ["rejected_expense"],
  ]);

  const advanceExpense = pickNumber(expenseSummary, [
    ["data", "advance_expense"],
    ["advance_expense"],
  ]);

  const companyExpense = pickNumber(expenseSummary, [
    ["data", "company_expense"],
    ["company_expense"],
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

  if (approvedExpense > 0) {
    items.push({
      type: "finance_approved_expense",
      level: "info",
      text: `إجمالي المصروفات المعتمدة هذا الشهر هو ${money(approvedExpense)} جنيه.`,
    });
  }

  if (pendingExpense > 0) {
    items.push({
      type: "finance_pending_expense",
      level: pendingExpense >= currentTotal * 0.25 ? "warning" : "info",
      text: `يوجد مصروفات معلقة بقيمة ${money(pendingExpense)} جنيه تحتاج متابعة.`,
    });
  }

  if (rejectedExpense > 0) {
    items.push({
      type: "finance_rejected_expense",
      level: "warning",
      text: `تم رفض مصروفات بقيمة ${money(rejectedExpense)} جنيه خلال الفترة الحالية.`,
    });
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

  const vehicles = pickItems(expenseByVehicle);
  if (vehicles.length > 0) {
    const top = vehicles[0];
    const vehicleName =
      top?.display_name || top?.fleet_no || top?.plate_no || "مركبة غير محددة";
    const value = Number(top?.total_amount || top?.amount || 0);

    items.push({
      type: "finance_top_vehicle_expense",
      level: "info",
      text: `أعلى مركبة من حيث المصروفات هذا الشهر هي "${vehicleName}" بإجمالي ${money(value)} جنيه.`,
    });
  }

  const paymentSources = pickItems(expenseByPaymentSource);
  if (paymentSources.length > 0) {
    const top = paymentSources[0];
    const label = paymentSourceLabel(top?.payment_source);
    const value = Number(top?.total_amount || 0);

    items.push({
      type: "finance_top_payment_source",
      level: "info",
      text: `أكبر مصدر دفع للمصروفات هذا الشهر هو "${label}" بإجمالي ${money(value)} جنيه.`,
    });
  }

  if (advanceExpense > 0 || companyExpense > 0) {
    if (advanceExpense > companyExpense) {
      items.push({
        type: "finance_advance_dominates",
        level: advanceExpense >= currentTotal * 0.5 ? "warning" : "info",
        text: `المصروفات من العهدة أعلى من مصروفات الشركة خلال هذا الشهر.`,
      });
    } else if (companyExpense > advanceExpense) {
      items.push({
        type: "finance_company_dominates",
        level: "info",
        text: `مصروفات الشركة أعلى من مصروفات العهدة خلال هذا الشهر.`,
      });
    }
  }

  const vendorItems = pickItems(topVendors);
  if (vendorItems.length > 0) {
    const top = vendorItems[0];
    const name = top?.vendor_name || "مورد غير معروف";
    const value = Number(top?.total_amount || 0);

    items.push({
      type: "finance_top_vendor",
      level: "info",
      text: `أعلى مورد من حيث المصروفات هذا الشهر هو "${name}" بإجمالي ${money(value)} جنيه.`,
    });
  }

  const approvalItems = pickItems(expenseApprovalBreakdown);
  if (approvalItems.length > 0) {
    const pendingRow = approvalItems.find(
      (x) => String(x?.approval_status || "").toUpperCase() === "PENDING"
    );

    if (pendingRow && Number(pendingRow?.total_amount || 0) > 0) {
      items.push({
        type: "finance_pending_breakdown",
        level: "warning",
        text: `حالة "معلق" تمثل ${money(
          pendingRow.total_amount || 0
        )} جنيه من إجمالي المصروفات المسجلة.`,
      });
    }
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
      level: "info",
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

function buildTripsInsights(data = {}) {
  const items = [];

  const tripsSummary = data?.tripsSummary;
  const activeTrips = data?.activeTrips;
  const tripsNeedFinancialClosure = data?.tripsNeedFinancialClosure;
  const topClientsByTrips = data?.topClientsByTrips;
  const topSitesByTrips = data?.topSitesByTrips;
  const topVehiclesByTrips = data?.topVehiclesByTrips;

  const totalTrips = pickNumber(tripsSummary, [
    ["data", "total_trips"],
    ["total_trips"],
    ["data", "total"],
    ["total"],
  ]);

  const activeCount = pickNumber(tripsSummary, [
    ["data", "active_count"],
    ["active_count"],
  ]);

  const needClosureCount = pickNumber(tripsSummary, [
    ["data", "need_financial_closure_count"],
    ["need_financial_closure_count"],
  ]);

  if (totalTrips > 0) {
    items.push({
      type: "trips_total",
      level: "info",
      text: `إجمالي الرحلات في ${labelRange("this_month")} هو ${Number(totalTrips)} رحلة.`,
    });
  }

  if (activeCount > 0) {
    items.push({
      type: "trips_active_count",
      level: "info",
      text: `يوجد ${Number(activeCount)} رحلة نشطة خلال الفترة الحالية.`,
    });
  }

  if (needClosureCount > 0) {
    items.push({
      type: "trips_need_fin_closure",
      level: "warning",
      text: `يوجد ${Number(needClosureCount)} رحلة تحتاج إغلاقًا ماليًا.`,
    });
  }

  const activeTripItems = pickItems(activeTrips);
  if (activeTripItems.length > 0) {
    const first = activeTripItems[0];
    items.push({
      type: "trips_active_example",
      level: "info",
      text: `من الرحلات النشطة الحالية: عميل "${first.client_name || "عميل غير معروف"}" في موقع "${first.site_name || "موقع غير معروف"}".`,
    });
  }

  const needClosureItems = pickItems(tripsNeedFinancialClosure);
  if (needClosureItems.length > 0) {
    const first = needClosureItems[0];
    items.push({
      type: "trips_need_fin_closure_example",
      level: "warning",
      text: `هناك رحلة مكتملة للعميل "${first.client_name || "عميل غير معروف"}" ما زالت تحتاج إغلاقًا ماليًا.`,
    });
  }

  const topClients = pickItems(topClientsByTrips);
  if (topClients.length > 0) {
    const top = topClients[0];
    items.push({
      type: "trips_top_client",
      level: "info",
      text: `أعلى عميل من حيث عدد الرحلات هو "${top.client_name || "عميل غير معروف"}" بعدد ${Number(
        top.trips_count || 0
      )} رحلة.`,
    });
  }

  const topSites = pickItems(topSitesByTrips);
  if (topSites.length > 0) {
    const top = topSites[0];
    items.push({
      type: "trips_top_site",
      level: "info",
      text: `أعلى موقع من حيث عدد الرحلات هو "${top.site_name || "موقع غير معروف"}" بعدد ${Number(
        top.trips_count || 0
      )} رحلة.`,
    });
  }

  const topVehicles = pickItems(topVehiclesByTrips);
  if (topVehicles.length > 0) {
    const top = topVehicles[0];
    const vehicleName = top?.display_name || top?.fleet_no || top?.plate_no || "مركبة غير معروفة";
    items.push({
      type: "trips_top_vehicle",
      level: "info",
      text: `أعلى مركبة من حيث عدد الرحلات هي "${vehicleName}" بعدد ${Number(
        top.trips_count || 0
      )} رحلة.`,
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

  if (c === "trips") {
    return buildTripsInsights(data);
  }

  return [
    ...buildFinanceInsights(data),
    ...buildArInsights(data),
    ...buildMaintenanceInsights(data),
    ...buildInventoryInsights(data),
    ...buildTripsInsights(data),
  ].slice(0, 12);
}

module.exports = {
  buildInsightsByContext,
};