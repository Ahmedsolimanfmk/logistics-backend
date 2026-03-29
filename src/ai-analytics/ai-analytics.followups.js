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
  return Number(limit || 0) > 1 ? singleQuestion : multiQuestion;
}

function expandToggle(limit) {
  return Number(limit || 0) <= 10 ? "اعرض 10" : null;
}

function hasEntity(parsed, key) {
  return Boolean(parsed?.entities?.[key]);
}

function buildEntityAwareTripFollowups(parsed) {
  if (hasEntity(parsed, "client_hint")) {
    return uniqueQuestions([
      "رحلاته هذا الشهر",
      "الرحلات النشطة له",
      "التي تحتاج إغلاق مالي",
      "اعرض أعلى 5 مواقع حسب الرحلات",
      "اعرض أعلى 5 مركبات حسب الرحلات",
    ]);
  }

  if (hasEntity(parsed, "site_hint")) {
    return uniqueQuestions([
      "رحلات الموقع هذا الشهر",
      "الرحلات النشطة للموقع",
      "التي تحتاج إغلاق مالي",
      "اعرض أعلى 5 عملاء حسب الرحلات",
      "اعرض أعلى 5 مركبات حسب الرحلات",
    ]);
  }

  if (hasEntity(parsed, "vehicle_hint")) {
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
  const executed = execution?.ok && execution?.executed;

  if (executed) {
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

  return uniqueQuestions([
    "نفذ الآن",
    "عدّل البيانات",
    "اكتب الأمر بشكل أوضح",
  ]);
}

function buildReferenceFollowUps(parsed) {
  const entityAware = buildEntityAwareTripFollowups(parsed);
  if (entityAware.length) return entityAware;

  return uniqueQuestions([
    "الأول",
    "الثاني",
    "اعرض 10",
    "اعرض أعلى 5 عملاء مديونية",
    "اعرض أعلى 5 مركبات حسب الرحلات",
  ]);
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

function getFollowUpQuestions({ parsed, result, execution = null }) {
  const intent = parsed?.intent;
  const limit = Number(parsed?.options?.limit || 0);

  if (parsed?.mode === "action") {
    return buildActionFollowUps(parsed, execution);
  }

  if (parsed?.mode === "reference_followup") {
    return buildReferenceFollowUps(parsed);
  }

  switch (intent) {
    case "expense_summary":
      return uniqueQuestions([
        "ما أعلى نوع مصروف هذا الشهر؟",
        "اعرض أعلى 5 أنواع مصروف هذا الشهر",
        "قارن بالشهر الماضي",
      ]);

    case "expense_by_type":
      return uniqueQuestions([
        "كم إجمالي المصروفات هذا الشهر؟",
        topToggle(limit, "ما أعلى نوع مصروف؟", "اعرض أعلى 5 أنواع مصروف"),
        expandToggle(limit),
      ]);

    case "top_debtors":
      return uniqueQuestions([
        "ما إجمالي مستحقات العملاء؟",
        topToggle(limit, "من أعلى عميل؟", "اعرض أعلى 5 عملاء"),
        "الأول",
        expandToggle(limit),
      ]);

    case "trips_summary":
    case "active_trips":
    case "trips_need_financial_closure":
      return buildEntityAwareTripFollowups(parsed);

    default:
      return defaultFollowUps();
  }
}

module.exports = {
  getFollowUpQuestions,
};