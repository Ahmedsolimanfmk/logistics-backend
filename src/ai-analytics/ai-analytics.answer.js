const { labelRange } = require("./ai-analytics.time-labels");

// =======================
// Generic helpers
// =======================
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

function extractVendorName(item) {
  return (
    item?.vendor_name ||
    item?.vendors?.name ||
    item?.vendor?.name ||
    item?.name ||
    null
  );
}

function renderTopList(items, getLabel, getValue, unit = "جنيه") {
  return items
    .map((item, idx) => {
      const label = getLabel(item) || "غير محدد";
      const value = getValue(item);

      return `${idx + 1}) ${label} — ${
        unit === "عدد" ? Number(value || 0) : `${money(value)} ${unit}`
      }`;
    })
    .join("\n");
}

function renderEntityLabel(item) {
  if (!item || typeof item !== "object") return "العنصر المطلوب";

  return (
    item.client_name ||
    item.site_name ||
    item.vehicle_name ||
    item.display_name ||
    item.part_name ||
    item.item_name ||
    item.expense_type ||
    item.type_name ||
    extractVendorName(item) ||
    item.payment_source ||
    item.approval_status ||
    item.plate_no ||
    item.fleet_no ||
    item.trip_code ||
    item.name ||
    "العنصر المطلوب"
  );
}

function paymentSourceLabel(v) {
  const s = String(v || "").toUpperCase();
  if (s === "ADVANCE") return "عهدة";
  if (s === "COMPANY") return "شركة";
  return v || "غير محدد";
}

function approvalStatusLabel(v) {
  const s = String(v || "").toUpperCase();

  if (s === "PENDING") return "معلق";
  if (s === "APPROVED") return "معتمد";
  if (s === "REJECTED") return "مرفوض";
  if (s === "APPEALED") return "تم التظلم";
  if (s === "RESOLVED") return "تمت المعالجة";

  return v || "غير محدد";
}

function financialStatusLabel(v) {
  const s = String(v || "").toUpperCase();

  if (s === "OPEN") return "مفتوح";
  if (s === "UNDER_REVIEW") return "تحت المراجعة";
  if (s === "CLOSED") return "مغلق";

  return v || "غير محدد";
}

function answerWithUi({ parsed, result, answer }) {
  return {
    answer,
    ui: buildUiMeta({ parsed, result, answer }),
  };
}

// =======================
// Common extractors
// =======================
function getRangeLabel(parsed) {
  return labelRange(parsed?.filters?.range);
}

function getLimit(parsed) {
  return parsed?.options?.limit || 1;
}

function getFocus(parsed) {
  return parsed?.filters?.focus;
}

function getEntityHints(parsed) {
  return {
    client: parsed?.entities?.client_hint || null,
    site: parsed?.entities?.site_hint || null,
    vehicle: parsed?.entities?.vehicle_hint || null,
  };
}

function buildTopOrSingleAnswer({
  parsed,
  result,
  emptyText,
  topText,
  singleText,
  getLabel,
  getValue,
  unit = "جنيه",
}) {
  const items = pickItems(result);
  const limit = getLimit(parsed);
  const rangeLabel = getRangeLabel(parsed);

  if (!items.length) {
    return answerWithUi({
      parsed,
      result,
      answer: emptyText(rangeLabel),
    });
  }

  if (limit > 1) {
    return answerWithUi({
      parsed,
      result,
      answer: topText(
        rangeLabel,
        Math.min(limit, items.length),
        renderTopList(items.slice(0, limit), getLabel, getValue, unit)
      ),
    });
  }

  const top = items[0];
  return answerWithUi({
    parsed,
    result,
    answer: singleText(rangeLabel, top),
  });
}

// =======================
// Action / reference answers
// =======================
function buildExpenseCompareAnswer(result) {
  const current = Number(result?.data?.this_month_total || 0);
  const last = Number(result?.data?.last_month_total || 0);
  const diff = current - last;
  const absDiff = Math.abs(diff);

  if (current === 0 && last === 0) {
    return "لا توجد مصروفات مسجلة في هذا الشهر أو الشهر الماضي.";
  }

  if (diff === 0) {
    return `إجمالي المصروفات في هذا الشهر يساوي الشهر الماضي، والقيمة هي ${money(
      current
    )} جنيه.`;
  }

  if (diff > 0) {
    return `إجمالي المصروفات هذا الشهر هو ${money(current)} جنيه مقابل ${money(
      last
    )} جنيه في الشهر الماضي، بزيادة قدرها ${money(absDiff)} جنيه.`;
  }

  return `إجمالي المصروفات هذا الشهر هو ${money(current)} جنيه مقابل ${money(
    last
  )} جنيه في الشهر الماضي، بانخفاض قدره ${money(absDiff)} جنيه.`;
}

function buildActionAnswer({ parsed, execution }) {
  const intent = parsed?.intent;

  if (execution?.ok && execution?.executed) {
    if (intent === "create_work_order") {
      const woId = execution?.data?.work_order?.id || "غير معروف";
      const vehicleName =
        execution?.data?.vehicle?.display_name ||
        execution?.data?.vehicle?.fleet_no ||
        execution?.data?.vehicle?.plate_no ||
        "المركبة المحددة";

      const vendorName =
        execution?.data?.vendor?.name ||
        execution?.data?.work_order?.vendor_name ||
        null;

      return vendorName
        ? `تم إنشاء أمر العمل بنجاح للمركبة "${vehicleName}" وربطه بالمورد "${vendorName}". رقم أمر العمل: ${woId}.`
        : `تم إنشاء أمر العمل بنجاح للمركبة "${vehicleName}". رقم أمر العمل: ${woId}.`;
    }

    if (intent === "create_maintenance_request") {
      const requestId = execution?.data?.request?.id || "غير معروف";
      const vehicleName =
        execution?.data?.vehicle?.display_name ||
        execution?.data?.vehicle?.fleet_no ||
        execution?.data?.vehicle?.plate_no ||
        "المركبة المحددة";

      return `تم إنشاء طلب الصيانة بنجاح للمركبة "${vehicleName}". رقم الطلب: ${requestId}.`;
    }

    if (intent === "create_expense") {
      const expenseId = execution?.data?.expense?.id || "غير معروف";
      const amount = execution?.data?.expense?.amount || 0;
      const expenseType = execution?.data?.expense?.expense_type || "مصروف";
      const vendorName =
        execution?.data?.expense?.vendor_name ||
        execution?.data?.vendor?.name ||
        null;

      return vendorName
        ? `تم تسجيل المصروف "${expenseType}" بنجاح بقيمة ${money(
            amount
          )} جنيه لصالح المورد "${vendorName}". رقم المصروف: ${expenseId}.`
        : `تم تسجيل المصروف "${expenseType}" بنجاح بقيمة ${money(
            amount
          )} جنيه. رقم المصروف: ${expenseId}.`;
    }

    return "تم تنفيذ الأمر بنجاح.";
  }

  return execution?.message || "تعذر تنفيذ الأمر المطلوب.";
}

function buildReferenceFollowupAnswer({ parsed, result }) {
  const items = pickItems(result);
  const item = items[0] || null;

  if (!item) {
    return "لم أتمكن من تحديد العنصر المقصود من النتائج السابقة.";
  }

  if (parsed?.intent === "reference_previous_item") {
    return `تم تحديد العنصر المقصود من النتائج السابقة: "${renderEntityLabel(item)}".`;
  }

  if (parsed?.intent === "reference_previous_entity") {
    return `تم استخدام نفس الكيان السابق: "${renderEntityLabel(item)}".`;
  }

  if (parsed?.intent === "reference_previous_expand_limit") {
    return `تم توسيع النتائج السابقة وعرض ${items.length} عنصر.`;
  }

  return `تم الرجوع إلى النتائج السابقة وتحديد: "${renderEntityLabel(item)}".`;
}

// =======================
// Profit answer
// =======================
function buildProfitAnswer(parsed, result) {
  const revenue = Number(
    pickValue(result, [
      ["data", "revenue"],
      ["revenue"],
    ]) || 0
  );

  const expense = Number(
    pickValue(result, [
      ["data", "expense"],
      ["expense"],
    ]) || 0
  );

  const profit = Number(
    pickValue(result, [
      ["data", "profit"],
      ["profit"],
    ]) || 0
  );

  const marginPct = Number(
    pickValue(result, [
      ["data", "margin_pct"],
      ["margin_pct"],
    ]) || 0
  );

  const invoicesCount = Number(
    pickValue(result, [
      ["data", "invoices_count"],
      ["invoices_count"],
    ]) || 0
  );

  const expensesCount = Number(
    pickValue(result, [
      ["data", "expenses_count"],
      ["expenses_count"],
    ]) || 0
  );

  const matchedClients =
    pickValue(result, [
      ["data", "matched_clients"],
      ["matched_clients"],
    ]) || [];

  const reasoning =
    pickValue(result, [["reasoning"]]) || null;

  const clientLabel =
    parsed?.entities?.client_hint ||
    (Array.isArray(matchedClients) && matchedClients[0]) ||
    "العميل المحدد";

  if (revenue === 0 && expense === 0) {
    return `لا توجد حركة مالية كافية للعميل "${clientLabel}" خلال ${getRangeLabel(
      parsed
    )} للحكم على الربحية.`;
  }

  let verdict = "";
  if (reasoning?.verdict) {
    verdict = `${reasoning.verdict} `;
  } else if (profit > 0) {
    verdict = "العميل مربح. ";
  } else if (profit < 0) {
    verdict = "العميل غير مربح حاليًا. ";
  } else {
    verdict = "العميل عند نقطة التعادل تقريبًا. ";
  }

  let note = "";
  if (reasoning?.note) {
    note = ` ${reasoning.note}`;
  }

  return `${verdict}إيراده خلال ${getRangeLabel(
    parsed
  )} هو ${money(revenue)} جنيه، ومصروفاته ${money(expense)} جنيه، وصافي الربح ${money(
    profit
  )} جنيه، بهامش ربح ${money(marginPct)}%. عدد الفواتير ${Number(
    invoicesCount
  )} وعدد المصروفات ${Number(expensesCount)}.${note}`;
}

// =======================
// UI meta
// =======================
function buildUiMeta({ parsed, result, answer }) {
  const intent = parsed?.intent;
  const range = parsed?.filters?.range;
  const limit = getLimit(parsed);
  const hints = getEntityHints(parsed);

  let title = "TREX AI Response";
  const badges = [];

  if (parsed?.module === "finance") badges.push("المالية");
  if (parsed?.module === "ar") badges.push("حسابات العملاء");
  if (parsed?.module === "maintenance") badges.push("الصيانة");
  if (parsed?.module === "inventory") badges.push("المخازن");
  if (parsed?.module === "trips") badges.push("الرحلات");

  if (hints.client) badges.push(`عميل: ${hints.client}`);
  if (hints.site) badges.push(`موقع: ${hints.site}`);
  if (hints.vehicle) badges.push(`مركبة: ${hints.vehicle}`);

  if (parsed?.mode === "reference_followup") badges.push("متابعة");
  if (range) badges.push(labelRange(range));
  if (limit > 1) badges.push(`Top ${limit}`);

  if (intent === "expense_summary") title = "إجمالي المصروفات";
  else if (intent === "expense_summary_compare") title = "مقارنة المصروفات";
  else if (intent === "expense_by_type") title = limit > 1 ? "أعلى أنواع المصروف" : "أعلى نوع مصروف";
  else if (intent === "expense_by_vehicle") title = limit > 1 ? "أعلى المركبات صرفًا" : "أعلى مركبة صرفًا";
  else if (intent === "expense_by_payment_source") title = "المصروفات حسب مصدر الدفع";
  else if (intent === "top_vendors") title = limit > 1 ? "أعلى الموردين مصروفات" : "أعلى مورد مصروفات";
  else if (intent === "expense_approval_breakdown") title = "حالات اعتماد المصروفات";
  else if (intent === "outstanding_summary") title = "مستحقات العملاء";
  else if (intent === "top_debtors") title = limit > 1 ? "أعلى العملاء مديونية" : "أعلى عميل مديونية";
  else if (intent === "open_work_orders") title = "أوامر العمل المفتوحة";
  else if (intent === "maintenance_cost_by_vehicle") title = limit > 1 ? "أعلى المركبات تكلفة صيانة" : "أعلى مركبة تكلفة صيانة";
  else if (intent === "top_issued_parts") title = limit > 1 ? "أكثر الأصناف صرفًا" : "أكثر صنف صرفًا";
  else if (intent === "low_stock_items") title = "الأصناف منخفضة المخزون";
  else if (intent === "trips_summary") title = "ملخص الرحلات";
  else if (intent === "active_trips") title = limit > 1 ? "الرحلات النشطة" : "الرحلة النشطة";
  else if (intent === "trips_need_financial_closure") title = "رحلات تحتاج إغلاق مالي";
  else if (intent === "top_clients_by_trips") title = limit > 1 ? "أعلى العملاء حسب الرحلات" : "أعلى عميل حسب الرحلات";
  else if (intent === "top_sites_by_trips") title = limit > 1 ? "أعلى المواقع حسب الرحلات" : "أعلى موقع حسب الرحلات";
  else if (intent === "top_vehicles_by_trips") title = limit > 1 ? "أعلى المركبات حسب الرحلات" : "أعلى مركبة حسب الرحلات";
  else if (intent === "entity_profit_summary") title = "ربحية العميل";
  else if (intent === "create_work_order") title = "إنشاء أمر عمل";
  else if (intent === "create_maintenance_request") title = "إنشاء طلب صيانة";
  else if (intent === "create_expense") title = "تسجيل مصروف";
  else if (intent === "reference_previous_item") title = "عنصر من النتائج السابقة";
  else if (intent === "reference_previous_entity") title = "نفس الكيان السابق";
  else if (intent === "reference_previous_expand_limit") title = "توسيع النتائج السابقة";

  return {
    mode: parsed?.mode || "unknown",
    title,
    summary: answer,
    badges,
    result_type: parsed?.options?.response_type || "summary",
    has_items: pickItems(result).length > 0,
  };
}

// =======================
// Intent handlers
// =======================
function handleExpenseSummary(parsed, result) {
  const totalExpense = pickValue(result, [
    ["data", "total_expense"],
    ["total_expense"],
    ["data", "total"],
    ["total"],
  ]);

  const { vehicle, client, site } = getEntityHints(parsed);
  const rangeLabel = getRangeLabel(parsed);

  let answer = `إجمالي المصروفات خلال ${rangeLabel} هو ${money(totalExpense)} جنيه مصري.`;

  if (vehicle) {
    answer = `إجمالي مصروفات المركبة "${vehicle}" خلال ${rangeLabel} هو ${money(
      totalExpense
    )} جنيه مصري.`;
  } else if (client) {
    answer = `إجمالي مصروفات العميل "${client}" خلال ${rangeLabel} هو ${money(
      totalExpense
    )} جنيه مصري.`;
  } else if (site) {
    answer = `إجمالي مصروفات الموقع "${site}" خلال ${rangeLabel} هو ${money(
      totalExpense
    )} جنيه مصري.`;
  }

  return answerWithUi({ parsed, result, answer });
}

function handleExpenseByType(parsed, result) {
  return buildTopOrSingleAnswer({
    parsed,
    result,
    emptyText: (rangeLabel) => `لا توجد بيانات مصروفات حسب النوع خلال ${rangeLabel}.`,
    topText: (rangeLabel, count, list) =>
      `أعلى ${count} أنواع مصروف خلال ${rangeLabel}:\n${list}`,
    singleText: (rangeLabel, top) =>
      `أعلى نوع مصروف خلال ${rangeLabel} هو "${
        top.expense_type || top.type_name || top.name || "غير محدد"
      }" بإجمالي ${money(top.total_amount || top.amount || 0)} جنيه.`,
    getLabel: (x) => x.expense_type || x.type_name || x.name,
    getValue: (x) => x.total_amount || x.amount || 0,
  });
}

function handleExpenseByVehicle(parsed, result) {
  return buildTopOrSingleAnswer({
    parsed,
    result,
    emptyText: (rangeLabel) => `لا توجد بيانات مصروفات حسب المركبة خلال ${rangeLabel}.`,
    topText: (rangeLabel, count, list) =>
      `أعلى ${count} مركبات من حيث المصروفات خلال ${rangeLabel}:\n${list}`,
    singleText: (rangeLabel, top) =>
      `أعلى مركبة من حيث المصروفات خلال ${rangeLabel} هي "${
        top.display_name || top.fleet_no || top.plate_no || "غير محددة"
      }" بإجمالي ${money(top.total_amount || top.amount || 0)} جنيه.`,
    getLabel: (x) => x.display_name || x.fleet_no || x.plate_no || "مركبة غير معروفة",
    getValue: (x) => x.total_amount || x.amount || 0,
  });
}

function handleExpenseByPaymentSource(parsed, result) {
  const items = pickItems(result);
  const answer = !items.length
    ? `لا توجد بيانات مصروفات حسب مصدر الدفع خلال ${getRangeLabel(parsed)}.`
    : `توزيع المصروفات حسب مصدر الدفع خلال ${getRangeLabel(parsed)}:\n${renderTopList(
        items,
        (x) => paymentSourceLabel(x.payment_source),
        (x) => x.total_amount || 0
      )}`;

  return answerWithUi({ parsed, result, answer });
}

function handleTopVendors(parsed, result) {
  return buildTopOrSingleAnswer({
    parsed,
    result,
    emptyText: (rangeLabel) => `لا توجد بيانات موردين خلال ${rangeLabel}.`,
    topText: (rangeLabel, count, list) =>
      `أعلى ${count} موردين من حيث المصروفات خلال ${rangeLabel}:\n${list}`,
    singleText: (rangeLabel, top) =>
      `أعلى مورد من حيث المصروفات خلال ${rangeLabel} هو "${
        extractVendorName(top) || "مورد غير معروف"
      }" بإجمالي ${money(top.total_amount || 0)} جنيه.`,
    getLabel: (x) => extractVendorName(x) || "مورد غير معروف",
    getValue: (x) => x.total_amount || 0,
  });
}

function handleExpenseApprovalBreakdown(parsed, result) {
  const items = pickItems(result);
  const answer = !items.length
    ? `لا توجد بيانات لحالات اعتماد المصروفات خلال ${getRangeLabel(parsed)}.`
    : `توزيع المصروفات حسب حالة الاعتماد خلال ${getRangeLabel(parsed)}:\n${renderTopList(
        items,
        (x) => approvalStatusLabel(x.approval_status),
        (x) => x.total_amount || 0
      )}`;

  return answerWithUi({ parsed, result, answer });
}

function handleOutstandingSummary(parsed, result) {
  const totalOutstanding = pickValue(result, [
    ["data", "total_outstanding"],
    ["total_outstanding"],
    ["data", "total"],
    ["total"],
  ]);

  const overdueAmount = pickValue(result, [
    ["data", "overdue_amount"],
    ["overdue_amount"],
  ]);

  const focus = getFocus(parsed);
  const clientHint = parsed?.entities?.client_hint;
  const rangeLabel = getRangeLabel(parsed);

  let answer = "";

  if (focus === "overdue_only") {
    answer = `قيمة متأخرات العملاء خلال ${rangeLabel} هي ${money(overdueAmount)} جنيه.`;
  } else {
    answer = `إجمالي مستحقات العملاء خلال ${rangeLabel} هو ${money(
      totalOutstanding
    )} جنيه، منها ${money(overdueAmount)} متأخرات.`;
  }

  if (clientHint) {
    if (focus === "overdue_only") {
      answer = `قيمة متأخرات العميل "${clientHint}" خلال ${rangeLabel} هي ${money(
        overdueAmount
      )} جنيه.`;
    } else {
      answer = `إجمالي مستحقات العميل "${clientHint}" خلال ${rangeLabel} هو ${money(
        totalOutstanding
      )} جنيه، منها ${money(overdueAmount)} متأخرات.`;
    }
  }

  return answerWithUi({ parsed, result, answer });
}

function handleTopDebtors(parsed, result) {
  return buildTopOrSingleAnswer({
    parsed,
    result,
    emptyText: (rangeLabel) => `لا توجد بيانات عملاء مديونية خلال ${rangeLabel}.`,
    topText: (rangeLabel, count, list) =>
      `أعلى ${count} عملاء مديونية خلال ${rangeLabel}:\n${list}`,
    singleText: (rangeLabel, top) =>
      `أعلى عميل مديونية خلال ${rangeLabel} هو "${
        top.client_name || top.name || "غير محدد"
      }" بإجمالي ${money(top.total_outstanding || top.amount || 0)} جنيه.`,
    getLabel: (x) => x.client_name || x.name,
    getValue: (x) => x.total_outstanding || x.amount || 0,
  });
}

function handleOpenWorkOrders(parsed, result) {
  const totalOpen = pickValue(result, [
    ["data", "total_open_work_orders"],
    ["total_open_work_orders"],
    ["data", "count"],
    ["count"],
    ["data", "total"],
    ["total"],
  ]);

  const vehicleHint = parsed?.entities?.vehicle_hint;
  const rangeLabel = getRangeLabel(parsed);

  let answer = `عدد أوامر العمل المفتوحة خلال ${rangeLabel} هو ${Number(totalOpen || 0)}.`;

  if (vehicleHint) {
    answer = `عدد أوامر العمل المفتوحة للمركبة "${vehicleHint}" خلال ${rangeLabel} هو ${Number(
      totalOpen || 0
    )}.`;
  }

  return answerWithUi({ parsed, result, answer });
}

function handleMaintenanceCostByVehicle(parsed, result) {
  return buildTopOrSingleAnswer({
    parsed,
    result,
    emptyText: (rangeLabel) => `لا توجد بيانات تكلفة صيانة للمركبات خلال ${rangeLabel}.`,
    topText: (rangeLabel, count, list) =>
      `أعلى ${count} مركبات من حيث تكلفة الصيانة خلال ${rangeLabel}:\n${list}`,
    singleText: (rangeLabel, top) =>
      `أعلى مركبة من حيث تكلفة الصيانة خلال ${rangeLabel} هي "${
        top.vehicle_name || top.display_name || top.plate_no || top.name || "غير محددة"
      }" بإجمالي ${money(top.total_cost || top.total_amount || top.amount || 0)} جنيه.`,
    getLabel: (x) => x.vehicle_name || x.display_name || x.plate_no || x.name,
    getValue: (x) => x.total_cost || x.total_amount || x.amount || 0,
  });
}

function handleTopIssuedParts(parsed, result) {
  return buildTopOrSingleAnswer({
    parsed,
    result,
    emptyText: (rangeLabel) => `لا توجد بيانات صرف أصناف خلال ${rangeLabel}.`,
    topText: (rangeLabel, count, list) =>
      `أكثر ${count} أصناف صرفًا خلال ${rangeLabel}:\n${list}`,
    singleText: (rangeLabel, top) =>
      `أكثر صنف تم صرفه خلال ${rangeLabel} هو "${
        top.part_name || top.item_name || top.name || "غير محدد"
      }" بعدد ${Number(top.total_issued_qty || top.issued_qty || top.qty || 0)}.`,
    getLabel: (x) => x.part_name || x.item_name || x.name,
    getValue: (x) => x.total_issued_qty || x.issued_qty || x.qty || 0,
    unit: "عدد",
  });
}

function handleLowStockItems(parsed, result) {
  const items = pickItems(result);
  const focus = getFocus(parsed);

  let answer = "";

  if (!items.length) {
    answer = "لا توجد أصناف منخفضة المخزون حاليًا.";
  } else if (focus === "count_only") {
    answer = `عدد الأصناف منخفضة المخزون حاليًا هو ${items.length}.`;
  } else {
    const top = items[0];
    answer = `يوجد ${items.length} أصناف منخفضة المخزون حاليًا. أقربها للنفاد هو "${
      top.part_name || top.item_name || top.name || "غير محدد"
    }".`;
  }

  return answerWithUi({ parsed, result, answer });
}

function handleTripsSummary(parsed, result) {
  const totalTrips = pickValue(result, [
    ["data", "total_trips"],
    ["total_trips"],
    ["data", "count"],
    ["count"],
    ["data", "total"],
    ["total"],
  ]);

  const activeCount = pickValue(result, [
    ["data", "active_count"],
    ["active_count"],
  ]);

  const completedCount = pickValue(result, [
    ["data", "completed_count"],
    ["completed_count"],
  ]);

  const { client, site, vehicle } = getEntityHints(parsed);
  const rangeLabel = getRangeLabel(parsed);

  let answer = `إجمالي الرحلات خلال ${rangeLabel} هو ${Number(
    totalTrips || 0
  )} رحلة، منها ${Number(activeCount || 0)} نشطة و${Number(
    completedCount || 0
  )} مكتملة.`;

  if (client) {
    answer = `إجمالي رحلات العميل "${client}" خلال ${rangeLabel} هو ${Number(
      totalTrips || 0
    )} رحلة، منها ${Number(activeCount || 0)} نشطة و${Number(
      completedCount || 0
    )} مكتملة.`;
  } else if (site) {
    answer = `إجمالي رحلات الموقع "${site}" خلال ${rangeLabel} هو ${Number(
      totalTrips || 0
    )} رحلة، منها ${Number(activeCount || 0)} نشطة و${Number(
      completedCount || 0
    )} مكتملة.`;
  } else if (vehicle) {
    answer = `إجمالي رحلات المركبة "${vehicle}" خلال ${rangeLabel} هو ${Number(
      totalTrips || 0
    )} رحلة، منها ${Number(activeCount || 0)} نشطة و${Number(
      completedCount || 0
    )} مكتملة.`;
  }

  return answerWithUi({ parsed, result, answer });
}

function handleActiveTrips(parsed, result) {
  const items = pickItems(result);
  const limit = getLimit(parsed);
  const { client, site, vehicle } = getEntityHints(parsed);
  const rangeLabel = getRangeLabel(parsed);

  let answer = "";

  if (!items.length) {
    if (client) {
      answer = `لا توجد رحلات نشطة للعميل "${client}" خلال ${rangeLabel}.`;
    } else if (site) {
      answer = `لا توجد رحلات نشطة للموقع "${site}" خلال ${rangeLabel}.`;
    } else if (vehicle) {
      answer = `لا توجد رحلات نشطة للمركبة "${vehicle}" خلال ${rangeLabel}.`;
    } else {
      answer = `لا توجد رحلات نشطة خلال ${rangeLabel}.`;
    }
  } else if (limit > 1) {
    answer = `أول ${Math.min(limit, items.length)} رحلات نشطة خلال ${rangeLabel}:\n${renderTopList(
      items.slice(0, limit),
      (x) => `${x.client_name || "عميل غير معروف"} — ${x.site_name || "موقع غير معروف"}`,
      () => 1,
      "عدد"
    )}`;
  } else {
    const top = items[0];
    answer = `هناك رحلة نشطة تخص العميل "${top.client_name || "عميل غير معروف"}" في "${
      top.site_name || "موقع غير معروف"
    }".`;
  }

  return answerWithUi({ parsed, result, answer });
}

function handleTripsNeedFinancialClosure(parsed, result) {
  const items = pickItems(result);
  const totalNeed = pickValue(result, [
    ["data", "total_need_financial_closure"],
    ["total_need_financial_closure"],
    ["data", "count"],
    ["count"],
  ]);

  const { client, site, vehicle } = getEntityHints(parsed);
  const rangeLabel = getRangeLabel(parsed);

  let answer = "";

  if (!items.length) {
    if (client) {
      answer = `لا توجد رحلات للعميل "${client}" تحتاج إغلاقًا ماليًا خلال ${rangeLabel}.`;
    } else if (site) {
      answer = `لا توجد رحلات للموقع "${site}" تحتاج إغلاقًا ماليًا خلال ${rangeLabel}.`;
    } else if (vehicle) {
      answer = `لا توجد رحلات للمركبة "${vehicle}" تحتاج إغلاقًا ماليًا خلال ${rangeLabel}.`;
    } else {
      answer = `لا توجد رحلات تحتاج إغلاقًا ماليًا خلال ${rangeLabel}.`;
    }
  } else {
    const count = Number(totalNeed || items.length);

    if (client) {
      answer = `يوجد ${count} رحلة للعميل "${client}" تحتاج إغلاقًا ماليًا خلال ${rangeLabel}.`;
    } else if (site) {
      answer = `يوجد ${count} رحلة للموقع "${site}" تحتاج إغلاقًا ماليًا خلال ${rangeLabel}.`;
    } else if (vehicle) {
      answer = `يوجد ${count} رحلة للمركبة "${vehicle}" تحتاج إغلاقًا ماليًا خلال ${rangeLabel}.`;
    } else {
      answer = `يوجد ${count} رحلة تحتاج إغلاقًا ماليًا خلال ${rangeLabel}.`;
    }
  }

  return answerWithUi({ parsed, result, answer });
}

function handleTopClientsByTrips(parsed, result) {
  return buildTopOrSingleAnswer({
    parsed,
    result,
    emptyText: (rangeLabel) => `لا توجد بيانات عملاء للرحلات خلال ${rangeLabel}.`,
    topText: (rangeLabel, count, list) =>
      `أعلى ${count} عملاء من حيث عدد الرحلات خلال ${rangeLabel}:\n${list}`,
    singleText: (rangeLabel, top) =>
      `أعلى عميل من حيث عدد الرحلات خلال ${rangeLabel} هو "${
        top.client_name || "عميل غير معروف"
      }" بعدد ${Number(top.trips_count || 0)} رحلة.`,
    getLabel: (x) => x.client_name || "عميل غير معروف",
    getValue: (x) => x.trips_count || 0,
    unit: "عدد",
  });
}

function handleTopSitesByTrips(parsed, result) {
  return buildTopOrSingleAnswer({
    parsed,
    result,
    emptyText: (rangeLabel) => `لا توجد بيانات مواقع للرحلات خلال ${rangeLabel}.`,
    topText: (rangeLabel, count, list) =>
      `أعلى ${count} مواقع من حيث عدد الرحلات خلال ${rangeLabel}:\n${list}`,
    singleText: (rangeLabel, top) =>
      `أعلى موقع من حيث عدد الرحلات خلال ${rangeLabel} هو "${
        top.site_name || "موقع غير معروف"
      }" بعدد ${Number(top.trips_count || 0)} رحلة.`,
    getLabel: (x) => x.site_name || "موقع غير معروف",
    getValue: (x) => x.trips_count || 0,
    unit: "عدد",
  });
}

function handleTopVehiclesByTrips(parsed, result) {
  return buildTopOrSingleAnswer({
    parsed,
    result,
    emptyText: (rangeLabel) => `لا توجد بيانات مركبات للرحلات خلال ${rangeLabel}.`,
    topText: (rangeLabel, count, list) =>
      `أعلى ${count} مركبات من حيث عدد الرحلات خلال ${rangeLabel}:\n${list}`,
    singleText: (rangeLabel, top) =>
      `أعلى مركبة من حيث عدد الرحلات خلال ${rangeLabel} هي "${
        top.display_name || top.fleet_no || top.plate_no || "مركبة غير معروفة"
      }" بعدد ${Number(top.trips_count || 0)} رحلة.`,
    getLabel: (x) => x.display_name || x.fleet_no || x.plate_no || "مركبة غير معروفة",
    getValue: (x) => x.trips_count || 0,
    unit: "عدد",
  });
}
function handleTripsProfitSummary(parsed, result) {
  const totalTrips = Number(pickValue(result, [["data", "total_trips"]]) || 0);
  const profitableCount = Number(pickValue(result, [["data", "profitable_count"]]) || 0);
  const lossCount = Number(pickValue(result, [["data", "loss_count"]]) || 0);
  const totalRevenue = Number(pickValue(result, [["data", "total_revenue"]]) || 0);
  const totalExpense = Number(pickValue(result, [["data", "total_expense"]]) || 0);
  const totalProfit = Number(pickValue(result, [["data", "total_profit"]]) || 0);
  const marginPct = pickValue(result, [["data", "margin_pct"]]);

  const answer = `ملخص ربحية الرحلات خلال ${getRangeLabel(parsed)}: عدد الرحلات ${totalTrips}، منها ${profitableCount} مربحة و${lossCount} خاسرة. إجمالي الإيراد ${money(totalRevenue)} جنيه، وإجمالي المصروفات ${money(totalExpense)} جنيه، وصافي الربح ${money(totalProfit)} جنيه، بهامش ${marginPct === null || marginPct === undefined ? "غير متاح" : `${money(marginPct)}%`}.`;

  return answerWithUi({ parsed, result, answer });
}

function handleTopProfitableTrips(parsed, result) {
  return buildTopOrSingleAnswer({
    parsed,
    result,
    emptyText: (rangeLabel) => `لا توجد رحلات مربحة خلال ${rangeLabel}.`,
    topText: (rangeLabel, count, list) =>
      `أعلى ${count} رحلات ربحًا خلال ${rangeLabel}:\n${list}`,
    singleText: (rangeLabel, top) =>
      `أعلى رحلة ربحًا خلال ${rangeLabel} هي "${
        top.trip_code || top.trip_id || "رحلة غير محددة"
      }" بصافي ربح ${money(top.profit || 0)} جنيه، وهامش ${
        top.margin_pct === null || top.margin_pct === undefined
          ? "غير متاح"
          : `${money(top.margin_pct)}%`
      }.`,
    getLabel: (x) =>
      `${x.trip_code || x.trip_id || "رحلة"} — ${x.client_name || "عميل غير معروف"}`,
    getValue: (x) => x.profit || 0,
  });
}

function handleWorstTripsByProfit(parsed, result) {
  return buildTopOrSingleAnswer({
    parsed,
    result,
    emptyText: (rangeLabel) => `لا توجد رحلات خاسرة خلال ${rangeLabel}.`,
    topText: (rangeLabel, count, list) =>
      `أكثر ${count} رحلات خسارة خلال ${rangeLabel}:\n${list}`,
    singleText: (rangeLabel, top) =>
      `أكثر رحلة خسارة خلال ${rangeLabel} هي "${
        top.trip_code || top.trip_id || "رحلة غير محددة"
      }" بصافي ${money(top.profit || 0)} جنيه، وهامش ${
        top.margin_pct === null || top.margin_pct === undefined
          ? "غير متاح"
          : `${money(top.margin_pct)}%`
      }.`,
    getLabel: (x) =>
      `${x.trip_code || x.trip_id || "رحلة"} — ${x.client_name || "عميل غير معروف"}`,
    getValue: (x) => x.profit || 0,
  });
}

function handleLowMarginTrips(parsed, result) {
  const items = pickItems(result);

  const answer = !items.length
    ? `لا توجد رحلات بهامش ربح منخفض خلال ${getRangeLabel(parsed)}.`
    : `الرحلات ذات هامش الربح المنخفض خلال ${getRangeLabel(parsed)}:\n${renderTopList(
        items,
        (x) => `${x.trip_code || x.trip_id || "رحلة"} — ${x.client_name || "عميل غير معروف"} — هامش ${money(x.margin_pct || 0)}%`,
        (x) => x.profit || 0
      )}`;

  return answerWithUi({ parsed, result, answer });
}
function handleTripProfitSummary(parsed, result) {
  const row = pickValue(result, [["data"]]);

  if (!row) {
    return answerWithUi({
      parsed,
      result,
      answer: "لم أجد الرحلة المطلوبة داخل الفترة المحددة.",
    });
  }

  const tripLabel = row.trip_code || row.trip_id || "الرحلة المحددة";
  const revenue = Number(row.revenue || 0);
  const expense = Number(row.expense || 0);
  const profit = Number(row.profit || 0);
  const marginPct = row.margin_pct;

  let verdict = "الرحلة عند نقطة التعادل تقريبًا.";
  if (profit > 0) verdict = "الرحلة مربحة.";
  if (profit < 0) verdict = "الرحلة خاسرة.";

  const answer = `${verdict} ${tripLabel} إيرادها ${money(
    revenue
  )} جنيه، ومصروفاتها ${money(expense)} جنيه، وصافي الربح ${money(
    profit
  )} جنيه، وهامش الربح ${
    marginPct === null || marginPct === undefined
      ? "غير متاح"
      : `${money(marginPct)}%`
  }.`;

  return answerWithUi({ parsed, result, answer });
}
// =======================
// Main
// =======================
function buildArabicAnswer({ parsed, result, execution = null }) {
  const intent = parsed?.intent;

  if (parsed?.mode === "action") {
    const answer = buildActionAnswer({ parsed, execution });
    return answerWithUi({
      parsed,
      result: execution,
      answer,
    });
  }

  if (parsed?.mode === "reference_followup") {
    const answer = buildReferenceFollowupAnswer({ parsed, result });
    return answerWithUi({ parsed, result, answer });
  }

  if (intent === "expense_summary_compare") {
    return answerWithUi({
      parsed,
      result,
      answer: buildExpenseCompareAnswer(result),
    });
  }
if (intent === "trips_profit_summary") {
  return handleTripsProfitSummary(parsed, result);
}

if (intent === "trip_profit_summary") {
  return handleTripProfitSummary(parsed, result);
}

if (intent === "top_profitable_trips") {
  return handleTopProfitableTrips(parsed, result);
}

if (intent === "worst_trips_by_profit") {
  return handleWorstTripsByProfit(parsed, result);
}

if (intent === "low_margin_trips") {
  return handleLowMarginTrips(parsed, result);
}

  if (intent === "expense_summary") {
    return handleExpenseSummary(parsed, result);
  }

  if (intent === "expense_by_type") {
    return handleExpenseByType(parsed, result);
  }

  if (intent === "expense_by_vehicle") {
    return handleExpenseByVehicle(parsed, result);
  }

  if (intent === "expense_by_payment_source") {
    return handleExpenseByPaymentSource(parsed, result);
  }

  if (intent === "top_vendors") {
    return handleTopVendors(parsed, result);
  }

  if (intent === "expense_approval_breakdown") {
    return handleExpenseApprovalBreakdown(parsed, result);
  }

  if (intent === "outstanding_summary") {
    return handleOutstandingSummary(parsed, result);
  }

  if (intent === "top_debtors") {
    return handleTopDebtors(parsed, result);
  }

  if (intent === "open_work_orders") {
    return handleOpenWorkOrders(parsed, result);
  }

  if (intent === "maintenance_cost_by_vehicle") {
    return handleMaintenanceCostByVehicle(parsed, result);
  }

  if (intent === "top_issued_parts") {
    return handleTopIssuedParts(parsed, result);
  }

  if (intent === "low_stock_items") {
    return handleLowStockItems(parsed, result);
  }

  if (intent === "trips_summary") {
    return handleTripsSummary(parsed, result);
  }

  if (intent === "active_trips") {
    return handleActiveTrips(parsed, result);
  }

  if (intent === "trips_need_financial_closure") {
    return handleTripsNeedFinancialClosure(parsed, result);
  }

  if (intent === "top_clients_by_trips") {
    return handleTopClientsByTrips(parsed, result);
  }

  if (intent === "top_sites_by_trips") {
    return handleTopSitesByTrips(parsed, result);
  }

  if (intent === "top_vehicles_by_trips") {
    return handleTopVehiclesByTrips(parsed, result);
  }

  if (intent === "entity_profit_summary") {
    return answerWithUi({
      parsed,
      result,
      answer: buildProfitAnswer(parsed, result),
    });
  }

  return answerWithUi({
    parsed,
    result,
    answer: "لم أتمكن من فهم السؤال بشكل كافٍ في النسخة الحالية.",
  });
}

module.exports = {
  buildArabicAnswer,
};