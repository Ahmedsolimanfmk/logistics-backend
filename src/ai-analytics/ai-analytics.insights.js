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
    pushInsight(
      items,
      "finance_total_expense",
      "info",
      `إجمالي المصروفات في ${labelRange("this_month")} هو ${money(currentTotal)} جنيه.`
    );
  }

  if (currentTotal > 0 || lastTotal > 0) {
    const delta = percentDelta(currentTotal, lastTotal);
    const absDelta = Math.abs(delta);

    if (absDelta >= 10) {
      pushInsight(
        items,
        "finance_vs_last_month",
        levelByMagnitude(absDelta),
        delta >= 0
          ? `المصروفات ارتفعت بنسبة ${money(absDelta)}% مقارنة بالشهر الماضي.`
          : `المصروفات انخفضت بنسبة ${money(absDelta)}% مقارنة بالشهر الماضي.`
      );
    }
  }

  if (approvedExpense > 0) {
    pushInsight(
      items,
      "finance_approved_expense",
      "info",
      `إجمالي المصروفات المعتمدة هذا الشهر هو ${money(approvedExpense)} جنيه.`
    );
  }

  if (pendingExpense > 0) {
    pushInsight(
      items,
      "finance_pending_expense",
      pendingExpense >= currentTotal * 0.25 ? "warning" : "info",
      `يوجد مصروفات معلقة بقيمة ${money(pendingExpense)} جنيه تحتاج متابعة.`
    );
  }

  if (rejectedExpense > 0) {
    pushInsight(
      items,
      "finance_rejected_expense",
      "warning",
      `تم رفض مصروفات بقيمة ${money(rejectedExpense)} جنيه خلال الفترة الحالية.`
    );
  }

  const expenseTypes = pickItems(expenseByType);
  const topExpenseType = firstItem(expenseTypes);
  if (topExpenseType) {
    const name =
      topExpenseType?.expense_type ||
      topExpenseType?.type_name ||
      topExpenseType?.name ||
      "غير محدد";

    const value = Number(topExpenseType?.total_amount || topExpenseType?.amount || 0);

    pushInsight(
      items,
      "finance_top_expense_type",
      "info",
      `أعلى نوع مصروف هذا الشهر هو "${name}" بإجمالي ${money(value)} جنيه.`
    );
  }

  const vehicles = pickItems(expenseByVehicle);
  const topVehicle = firstItem(vehicles);
  if (topVehicle) {
    const vehicleName =
      topVehicle?.display_name ||
      topVehicle?.fleet_no ||
      topVehicle?.plate_no ||
      "مركبة غير محددة";

    const value = Number(topVehicle?.total_amount || topVehicle?.amount || 0);

    pushInsight(
      items,
      "finance_top_vehicle_expense",
      "info",
      `أعلى مركبة من حيث المصروفات هذا الشهر هي "${vehicleName}" بإجمالي ${money(value)} جنيه.`
    );
  }

  const paymentSources = pickItems(expenseByPaymentSource);
  const topPaymentSource = firstItem(paymentSources);
  if (topPaymentSource) {
    const label = paymentSourceLabel(topPaymentSource?.payment_source);
    const value = Number(topPaymentSource?.total_amount || 0);

    pushInsight(
      items,
      "finance_top_payment_source",
      "info",
      `أكبر مصدر دفع للمصروفات هذا الشهر هو "${label}" بإجمالي ${money(value)} جنيه.`
    );
  }

  if (advanceExpense > 0 || companyExpense > 0) {
    if (advanceExpense > companyExpense) {
      pushInsight(
        items,
        "finance_advance_dominates",
        advanceExpense >= currentTotal * 0.5 ? "warning" : "info",
        "المصروفات من العهدة أعلى من مصروفات الشركة خلال هذا الشهر."
      );
    } else if (companyExpense > advanceExpense) {
      pushInsight(
        items,
        "finance_company_dominates",
        "info",
        "مصروفات الشركة أعلى من مصروفات العهدة خلال هذا الشهر."
      );
    }
  }

  const vendorItems = pickItems(topVendors);
  const topVendor = firstItem(vendorItems);
  if (topVendor) {
    const name = topVendor?.vendor_name || "مورد غير معروف";
    const value = Number(topVendor?.total_amount || 0);

    pushInsight(
      items,
      "finance_top_vendor",
      "info",
      `أعلى مورد من حيث المصروفات هذا الشهر هو "${name}" بإجمالي ${money(value)} جنيه.`
    );
  }

  const approvalItems = pickItems(expenseApprovalBreakdown);
  if (approvalItems.length > 0) {
    const pendingRow = approvalItems.find(
      (x) => String(x?.approval_status || "").toUpperCase() === "PENDING"
    );

    if (pendingRow && Number(pendingRow?.total_amount || 0) > 0) {
      pushInsight(
        items,
        "finance_pending_breakdown",
        "warning",
        `حالة "معلق" تمثل ${money(
          pendingRow.total_amount || 0
        )} جنيه من إجمالي المصروفات المسجلة.`
      );
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
    pushInsight(
      items,
      "ar_total_outstanding",
      overdueAmount > 0 ? "warning" : "info",
      `إجمالي مستحقات العملاء حاليًا هو ${money(totalOutstanding)} جنيه، منها ${money(
        overdueAmount
      )} متأخرات.`
    );
  }

  const debtors = pickItems(topDebtors);
  const topDebtor = firstItem(debtors);
  if (topDebtor) {
    const name = topDebtor?.client_name || topDebtor?.name || "غير محدد";
    const value = Number(topDebtor?.total_outstanding || topDebtor?.amount || 0);

    pushInsight(
      items,
      "ar_top_debtor",
      value > 0 ? "warning" : "info",
      `أعلى عميل مديونية حاليًا هو "${name}" بإجمالي ${money(value)} جنيه.`
    );
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

  pushInsight(
    items,
    "maintenance_open_work_orders",
    totalOpen > 0 ? "warning" : "info",
    totalOpen > 0
      ? `يوجد ${Number(totalOpen)} أوامر عمل مفتوحة حاليًا.`
      : "لا توجد أوامر عمل مفتوحة حاليًا."
  );

  const vehicles = pickItems(costByVehicle);
  const topVehicle = firstItem(vehicles);
  if (topVehicle) {
    const vehicleName =
      topVehicle?.vehicle_name ||
      topVehicle?.display_name ||
      topVehicle?.plate_no ||
      topVehicle?.name ||
      "غير محددة";

    const totalCost = Number(
      topVehicle?.total_cost || topVehicle?.total_amount || topVehicle?.amount || 0
    );

    pushInsight(
      items,
      "maintenance_top_vehicle_cost",
      "info",
      `أعلى مركبة تكلفة صيانة هذا الشهر هي "${vehicleName}" بإجمالي ${money(totalCost)} جنيه.`
    );
  }

  return items;
}

function buildInventoryInsights(data = {}) {
  const items = [];

  const topIssuedParts = data?.topIssuedParts;
  const lowStockItems = data?.lowStockItems;

  const issued = pickItems(topIssuedParts);
  const topIssued = firstItem(issued);
  if (topIssued) {
    const name = topIssued?.part_name || topIssued?.item_name || topIssued?.name || "غير محدد";
    const qty = Number(topIssued?.total_issued_qty || topIssued?.issued_qty || topIssued?.qty || 0);

    pushInsight(
      items,
      "inventory_top_issued_part",
      "info",
      `أكثر صنف صرفًا هذا الشهر هو "${name}" بعدد ${qty}.`
    );
  }

  const lowStock = pickItems(lowStockItems);
  if (lowStock.length > 0) {
    pushInsight(
      items,
      "inventory_low_stock_count",
      lowStock.length >= 5 ? "warning" : "info",
      `يوجد ${lowStock.length} أصناف منخفضة المخزون حاليًا.`
    );

    const firstLowStock = lowStock[0];
    const firstName =
      firstLowStock?.part_name ||
      firstLowStock?.item_name ||
      firstLowStock?.name ||
      "غير محدد";

    pushInsight(
      items,
      "inventory_low_stock_top",
      "warning",
      `أقرب صنف للنفاد حاليًا هو "${firstName}".`
    );
  } else {
    pushInsight(
      items,
      "inventory_low_stock_none",
      "info",
      "لا توجد أصناف منخفضة المخزون حاليًا."
    );
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
    pushInsight(
      items,
      "trips_total",
      "info",
      `إجمالي الرحلات في ${labelRange("this_month")} هو ${Number(totalTrips)} رحلة.`
    );
  }

  if (activeCount > 0) {
    pushInsight(
      items,
      "trips_active_count",
      "info",
      `يوجد ${Number(activeCount)} رحلة نشطة خلال الفترة الحالية.`
    );
  }

  if (needClosureCount > 0) {
    pushInsight(
      items,
      "trips_need_fin_closure",
      "warning",
      `يوجد ${Number(needClosureCount)} رحلة تحتاج إغلاقًا ماليًا.`
    );
  }

  const activeTripItems = pickItems(activeTrips);
  const firstActiveTrip = firstItem(activeTripItems);
  if (firstActiveTrip) {
    pushInsight(
      items,
      "trips_active_example",
      "info",
      `من الرحلات النشطة الحالية: عميل "${firstActiveTrip.client_name || "عميل غير معروف"}" في موقع "${
        firstActiveTrip.site_name || "موقع غير معروف"
      }".`
    );
  }

  const needClosureItems = pickItems(tripsNeedFinancialClosure);
  const firstNeedClosureTrip = firstItem(needClosureItems);
  if (firstNeedClosureTrip) {
    pushInsight(
      items,
      "trips_need_fin_closure_example",
      "warning",
      `هناك رحلة مكتملة للعميل "${
        firstNeedClosureTrip.client_name || "عميل غير معروف"
      }" ما زالت تحتاج إغلاقًا ماليًا.`
    );
  }

  const topClients = pickItems(topClientsByTrips);
  const topClient = firstItem(topClients);
  if (topClient) {
    pushInsight(
      items,
      "trips_top_client",
      "info",
      `أعلى عميل من حيث عدد الرحلات هو "${topClient.client_name || "عميل غير معروف"}" بعدد ${Number(
        topClient.trips_count || 0
      )} رحلة.`
    );
  }

  const topSites = pickItems(topSitesByTrips);
  const topSite = firstItem(topSites);
  if (topSite) {
    pushInsight(
      items,
      "trips_top_site",
      "info",
      `أعلى موقع من حيث عدد الرحلات هو "${topSite.site_name || "موقع غير معروف"}" بعدد ${Number(
        topSite.trips_count || 0
      )} رحلة.`
    );
  }

  const topVehicles = pickItems(topVehiclesByTrips);
  const topVehicle = firstItem(topVehicles);
  if (topVehicle) {
    const vehicleName =
      topVehicle?.display_name ||
      topVehicle?.fleet_no ||
      topVehicle?.plate_no ||
      "مركبة غير معروفة";

    pushInsight(
      items,
      "trips_top_vehicle",
      "info",
      `أعلى مركبة من حيث عدد الرحلات هي "${vehicleName}" بعدد ${Number(
        topVehicle.trips_count || 0
      )} رحلة.`
    );
  }

  return items;
}

function buildAllInsights(data = {}) {
  return [
    ...buildFinanceInsights(data),
    ...buildArInsights(data),
    ...buildMaintenanceInsights(data),
    ...buildInventoryInsights(data),
    ...buildTripsInsights(data),
  ];
}

function buildInsightsByContext({ context, data }) {
  const c = String(context || "").trim().toLowerCase();

  const builders = {
    finance: buildFinanceInsights,
    ar: buildArInsights,
    maintenance: buildMaintenanceInsights,
    inventory: buildInventoryInsights,
    trips: buildTripsInsights,
  };

  if (builders[c]) {
    return builders[c](data);
  }

  return buildAllInsights(data).slice(0, 12);
}

module.exports = {
  buildInsightsByContext,
};