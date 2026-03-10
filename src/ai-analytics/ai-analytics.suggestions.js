function roleUpper(role) {
  return String(role || "").trim().toUpperCase();
}

function normalizeContext(context) {
  const c = String(context || "").trim().toLowerCase();
  if (!c) return null;

  if (c === "finance") return "finance";
  if (c === "ar") return "ar";
  if (c === "maintenance") return "maintenance";
  if (c === "inventory") return "inventory";

  return null;
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
  const normalizedContext = normalizeContext(context);

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

  // IMPORTANT: context must win immediately
  if (normalizedContext && byContext[normalizedContext]) {
    return dedupe(byContext[normalizedContext]).slice(0, 8);
  }

  if (role === "ADMIN") {
    return dedupe([
      ...financeQuestions,
      ...arQuestions,
      ...maintenanceQuestions,
      ...inventoryQuestions,
    ]).slice(0, 12);
  }

  if (role === "ACCOUNTANT") {
    return dedupe([
      ...financeQuestions,
      ...arQuestions,
    ]).slice(0, 10);
  }

  if (role === "STOREKEEPER") {
    return dedupe(inventoryQuestions).slice(0, 8);
  }

  if (role === "FIELD_SUPERVISOR") {
    return dedupe([
      ...financeQuestions,
      ...maintenanceQuestions,
    ]).slice(0, 10);
  }

  if (role === "HR") {
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