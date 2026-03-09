function roleUpper(role) {
  return String(role || "").trim().toUpperCase();
}

function dedupe(items = []) {
  return Array.from(
    new Set(
      items
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  );
}

function getSuggestedQuestions({ user, context = null }) {
  const role = roleUpper(user?.role);

  const financeQuestions = [
    "كم إجمالي المصروفات هذا الشهر؟",
    "صرفنا كام هذا الشهر؟",
    "ما أعلى نوع مصروف هذا الشهر؟",
    "أكبر بند مصروف إيه هذا الشهر؟",
    "اعرض أعلى 5 أنواع مصروف هذا الشهر",
    "قارن مصروفات هذا الشهر بالشهر الماضي",
    "ما إجمالي المصروفات الشهر الماضي؟",
  ];

  const arQuestions = [
    "ما إجمالي مستحقات العملاء؟",
    "فلوسنا عند العملاء كام؟",
    "قيمة متأخرات العملاء كام؟",
    "من أعلى عميل مديونية؟",
    "اعرض أعلى 5 عملاء مديونية",
  ];

  const maintenanceQuestions = [
    "كم عدد أوامر العمل المفتوحة؟",
    "كام أمر عمل مفتوح؟",
    "ما أعلى مركبة تكلفة صيانة؟",
    "أنهي عربية صيانتها أعلى؟",
    "اعرض أعلى 5 مركبات تكلفة صيانة",
  ];

  const inventoryQuestions = [
    "ما أكثر قطع الغيار صرفاً؟",
    "أكثر صنف بيتصرف إيه؟",
    "اعرض أعلى 5 أصناف صرفًا",
    "ما الأصناف القريبة من النفاد؟",
    "إيه الأصناف اللي قربت تخلص؟",
    "كام عدد الأصناف منخفضة المخزون؟",
  ];

  const byContext = {
    finance: financeQuestions,
    ar: arQuestions,
    maintenance: maintenanceQuestions,
    inventory: inventoryQuestions,
  };

  if (context && byContext[context]) {
    return dedupe(byContext[context]).slice(0, 8);
  }

  if (["ADMIN"].includes(role)) {
    return dedupe([
      ...financeQuestions,
      ...arQuestions,
      ...maintenanceQuestions,
      ...inventoryQuestions,
    ]).slice(0, 12);
  }

  if (["ACCOUNTANT"].includes(role)) {
    return dedupe([
      ...financeQuestions,
      ...arQuestions,
    ]).slice(0, 10);
  }

  if (["STOREKEEPER"].includes(role)) {
    return dedupe(inventoryQuestions).slice(0, 8);
  }

  if (["FIELD_SUPERVISOR"].includes(role)) {
    return dedupe([
      ...financeQuestions,
      ...maintenanceQuestions,
    ]).slice(0, 10);
  }

  if (["HR"].includes(role)) {
    return dedupe(maintenanceQuestions).slice(0, 8);
  }

  return dedupe([
    ...maintenanceQuestions,
    ...inventoryQuestions,
  ]).slice(0, 8);
}

module.exports = {
  getSuggestedQuestions,
};