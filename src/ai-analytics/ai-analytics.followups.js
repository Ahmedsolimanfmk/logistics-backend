function uniqueQuestions(items = []) {
  return Array.from(
    new Set(
      items
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  );
}

function topToggle(limit, singleQuestion, multiQuestion) {
  return limit > 1 ? singleQuestion : multiQuestion;
}

function expandToggle(limit) {
  return limit <= 10 ? "اعرض 10" : null;
}

function buildEntityAwareTripFollowups(parsed) {
  const hasClient = Boolean(parsed?.entities?.client_hint);
  const hasSite = Boolean(parsed?.entities?.site_hint);
  const hasVehicle = Boolean(parsed?.entities?.vehicle_hint);

  if (hasClient) {
    return uniqueQuestions([
      "رحلاته هذا الشهر",
      "الرحلات النشطة له",
      "التي تحتاج إغلاق مالي",
      "اعرض أعلى 5 مواقع حسب الرحلات",
      "اعرض أعلى 5 مركبات حسب الرحلات",
    ]);
  }

  if (hasSite) {
    return uniqueQuestions([
      "رحلات الموقع هذا الشهر",
      "الرحلات النشطة للموقع",
      "التي تحتاج إغلاق مالي",
      "اعرض أعلى 5 عملاء حسب الرحلات",
      "اعرض أعلى 5 مركبات حسب الرحلات",
    ]);
  }

  if (hasVehicle) {
    return uniqueQuestions([
      "رحلات المركبة هذا الشهر",
      "الرحلات النشطة للمركبة",
      "التي تحتاج إغلاق مالي",
      "اعرض أعلى 5 عملاء حسب الرحلات",
      "اعرض أعلى 5 مواقع حسب الرحلات",
    ]);
  }

  return [];
}

function buildActionFollowUps(parsed, execution) {
  if (execution?.ok && execution?.executed) {
    if (parsed?.intent === "create_work_order") {
      return uniqueQuestions([
        "كم عدد أوامر العمل المفتوحة؟",
        "ما أعلى مركبة تكلفة صيانة؟",
        "اعرض أعلى 5 مركبات تكلفة صيانة",
      ]);
    }

    if (parsed?.intent === "create_maintenance_request") {
      return uniqueQuestions([
        "كم عدد أوامر العمل المفتوحة؟",
        "ما أعلى مركبة تكلفة صيانة؟",
      ]);
    }

    if (parsed?.intent === "create_expense") {
      return uniqueQuestions([
        "كم إجمالي المصروفات هذا الشهر؟",
        "ما أعلى نوع مصروف هذا الشهر؟",
        "اعرض أعلى 5 أنواع مصروف هذا الشهر",
      ]);
    }
  }

  if (parsed?.intent === "create_work_order") {
    return uniqueQuestions([
      "نفذ الآن",
      "عدّل اسم المركبة",
      "اكتب الأمر بشكل أوضح",
    ]);
  }

  if (parsed?.intent === "create_maintenance_request") {
    return uniqueQuestions([
      "نفذ الآن",
      "اكتب وصف العطل بشكل أوضح",
      "عدّل اسم المركبة",
    ]);
  }

  if (parsed?.intent === "create_expense") {
    return uniqueQuestions([
      "نفذ الآن",
      "أضف قيمة المصروف بوضوح",
      "حدّد نوع المصروف",
    ]);
  }

  return defaultFollowUps();
}

function buildReferenceFollowUps(parsed) {
  const entityAware = buildEntityAwareTripFollowups(parsed);
  if (entityAware.length) return entityAware;

  if (parsed?.intent === "reference_previous_expand_limit") {
    return uniqueQuestions([
      "الأول",
      "الثاني",
      "اعرض أعلى 5 عملاء مديونية",
      "اعرض أعلى 5 مركبات تكلفة صيانة",
      "اعرض أعلى 5 مركبات حسب الرحلات",
    ]);
  }

  if (parsed?.intent === "reference_previous_item") {
    return uniqueQuestions([
      "نفس العميل",
      "اعرض 10",
      "اعرض أعلى 5 عملاء مديونية",
      "اعرض أعلى 5 مركبات تكلفة صيانة",
      "اعرض أعلى 5 مركبات حسب الرحلات",
    ]);
  }

  if (parsed?.intent === "reference_previous_entity") {
    return uniqueQuestions([
      "اعرض 10",
      "الأول",
      "اعرض أعلى 5 عملاء مديونية",
      "كم إجمالي المصروفات هذا الشهر؟",
      "كم عدد الرحلات هذا الشهر؟",
    ]);
  }

  return defaultFollowUps();
}

function defaultFollowUps() {
  return uniqueQuestions([
    "كم إجمالي المصروفات هذا الشهر؟",
    "من أعلى عميل مديونية؟",
    "كم عدد أوامر العمل المفتوحة؟",
    "ما الأصناف القريبة من النفاد؟",
    "كم عدد الرحلات هذا الشهر؟",
  ]);
}

function getExpenseSummaryFollowUps() {
  return uniqueQuestions([
    "ما أعلى نوع مصروف هذا الشهر؟",
    "أكبر بند مصروف إيه هذا الشهر؟",
    "اعرض أعلى 5 أنواع مصروف هذا الشهر",
    "قارن مصروفات هذا الشهر بالشهر الماضي",
  ]);
}

function getExpenseByTypeFollowUps(limit) {
  return uniqueQuestions([
    "كم إجمالي المصروفات هذا الشهر؟",
    "صرفنا كام هذا الشهر؟",
    "قارن مصروفات هذا الشهر بالشهر الماضي",
    topToggle(limit, "ما أعلى نوع مصروف هذا الشهر؟", "اعرض أعلى 5 أنواع مصروف هذا الشهر"),
    expandToggle(limit),
  ]);
}

function getOutstandingSummaryFollowUps() {
  return uniqueQuestions([
    "قيمة متأخرات العملاء كام؟",
    "من أعلى عميل مديونية؟",
    "اعرض أعلى 5 عملاء مديونية",
    "فلوسنا عند العملاء كام؟",
  ]);
}

function getTopDebtorsFollowUps(limit) {
  return uniqueQuestions([
    "ما إجمالي مستحقات العملاء؟",
    "فلوسنا عند العملاء كام؟",
    "قيمة متأخرات العملاء كام؟",
    topToggle(limit, "من أعلى عميل مديونية؟", "اعرض أعلى 5 عملاء مديونية"),
    "الأول",
    expandToggle(limit),
  ]);
}

function getOpenWorkOrdersFollowUps() {
  return uniqueQuestions([
    "ما أعلى مركبة تكلفة صيانة؟",
    "اعرض أعلى 5 مركبات تكلفة صيانة",
    "ما أكثر قطع الغيار صرفاً؟",
    "إيه الأصناف اللي قربت تخلص؟",
  ]);
}

function getMaintenanceCostFollowUps(limit) {
  return uniqueQuestions([
    "كم عدد أوامر العمل المفتوحة؟",
    "كام أمر عمل مفتوح؟",
    topToggle(limit, "ما أعلى مركبة تكلفة صيانة؟", "اعرض أعلى 5 مركبات تكلفة صيانة"),
    "ما أكثر قطع الغيار صرفاً؟",
    "الأول",
    expandToggle(limit),
  ]);
}

function getTopIssuedPartsFollowUps(limit) {
  return uniqueQuestions([
    "ما الأصناف القريبة من النفاد؟",
    "إيه الأصناف اللي قربت تخلص؟",
    "كام عدد الأصناف منخفضة المخزون؟",
    topToggle(limit, "ما أكثر قطع الغيار صرفاً؟", "اعرض أعلى 5 أصناف صرفًا"),
    "الأول",
    expandToggle(limit),
  ]);
}

function getLowStockFollowUps() {
  return uniqueQuestions([
    "ما أكثر قطع الغيار صرفاً؟",
    "أكثر صنف بيتصرف إيه؟",
    "اعرض أعلى 5 أصناف صرفًا",
    "كم عدد أوامر العمل المفتوحة؟",
  ]);
}

function getTripsSummaryFollowUps(parsed) {
  const entityAware = buildEntityAwareTripFollowups(parsed);
  if (entityAware.length) return entityAware;

  return uniqueQuestions([
    "كم عدد الرحلات النشطة؟",
    "اعرض الرحلات النشطة",
    "كم عدد الرحلات التي تحتاج إغلاق مالي؟",
    "من أعلى عميل من حيث الرحلات؟",
    "اعرض أعلى 5 مركبات حسب الرحلات",
  ]);
}

function getActiveTripsFollowUps(parsed) {
  const entityAware = buildEntityAwareTripFollowups(parsed);
  if (entityAware.length) return entityAware;

  return uniqueQuestions([
    "كم عدد الرحلات هذا الشهر؟",
    "كم عدد الرحلات التي تحتاج إغلاق مالي؟",
    "من أعلى عميل من حيث الرحلات؟",
    "اعرض أعلى 5 مواقع حسب الرحلات",
  ]);
}

function getTripsNeedClosureFollowUps(parsed) {
  const entityAware = buildEntityAwareTripFollowups(parsed);
  if (entityAware.length) return entityAware;

  return uniqueQuestions([
    "كم عدد الرحلات هذا الشهر؟",
    "اعرض الرحلات النشطة",
    "اعرض أعلى 5 عملاء حسب الرحلات",
    "اعرض أعلى 5 مركبات حسب الرحلات",
  ]);
}

function getTopClientsByTripsFollowUps(limit) {
  return uniqueQuestions([
    "كم عدد الرحلات هذا الشهر؟",
    "اعرض أعلى 5 مواقع حسب الرحلات",
    "اعرض أعلى 5 مركبات حسب الرحلات",
    topToggle(limit, "من أعلى عميل من حيث الرحلات؟", "اعرض أعلى 5 عملاء حسب الرحلات"),
    "الأول",
    expandToggle(limit),
  ]);
}

function getTopSitesByTripsFollowUps(limit) {
  return uniqueQuestions([
    "كم عدد الرحلات هذا الشهر؟",
    "اعرض الرحلات النشطة",
    "اعرض أعلى 5 عملاء حسب الرحلات",
    "اعرض أعلى 5 مركبات حسب الرحلات",
    "الأول",
    expandToggle(limit),
  ]);
}

function getTopVehiclesByTripsFollowUps(limit) {
  return uniqueQuestions([
    "كم عدد الرحلات هذا الشهر؟",
    "اعرض الرحلات النشطة",
    "اعرض أعلى 5 عملاء حسب الرحلات",
    "اعرض أعلى 5 مواقع حسب الرحلات",
    topToggle(limit, "ما أعلى مركبة من حيث الرحلات؟", "اعرض أعلى 5 مركبات حسب الرحلات"),
    "الأول",
    expandToggle(limit),
  ]);
}

function getFollowUpQuestions({ parsed, result, execution = null }) {
  const intent = parsed?.intent;
  const limit = Number(parsed?.options?.limit || 0);

  if (parsed?.mode === "action") {
    return buildActionFollowUps(parsed, execution);
  }

  if (parsed?.mode === "reference_followup") {
    return buildReferenceFollowUps(parsed);
  }

  if (intent === "expense_summary_compare") {
    return uniqueQuestions([
      "كم إجمالي المصروفات هذا الشهر؟",
      "ما إجمالي المصروفات الشهر الماضي؟",
      "اعرض أعلى 5 أنواع مصروف هذا الشهر",
      "ما أعلى نوع مصروف هذا الشهر؟",
    ]);
  }

  if (intent === "expense_summary") {
    return getExpenseSummaryFollowUps();
  }

  if (intent === "expense_by_type") {
    return getExpenseByTypeFollowUps(limit);
  }

  if (intent === "outstanding_summary") {
    return getOutstandingSummaryFollowUps();
  }

  if (intent === "top_debtors") {
    return getTopDebtorsFollowUps(limit);
  }

  if (intent === "open_work_orders") {
    return getOpenWorkOrdersFollowUps();
  }

  if (intent === "maintenance_cost_by_vehicle") {
    return getMaintenanceCostFollowUps(limit);
  }

  if (intent === "top_issued_parts") {
    return getTopIssuedPartsFollowUps(limit);
  }

  if (intent === "low_stock_items") {
    return getLowStockFollowUps();
  }

  if (intent === "trips_summary") {
    return getTripsSummaryFollowUps(parsed);
  }

  if (intent === "active_trips") {
    return getActiveTripsFollowUps(parsed);
  }

  if (intent === "trips_need_financial_closure") {
    return getTripsNeedClosureFollowUps(parsed);
  }

  if (intent === "top_clients_by_trips") {
    return getTopClientsByTripsFollowUps(limit);
  }

  if (intent === "top_sites_by_trips") {
    return getTopSitesByTripsFollowUps(limit);
  }

  if (intent === "top_vehicles_by_trips") {
    return getTopVehiclesByTripsFollowUps(limit);
  }

  return defaultFollowUps();
}

module.exports = {
  getFollowUpQuestions,
};