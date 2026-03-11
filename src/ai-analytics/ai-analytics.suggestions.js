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

const SUGGESTIONS = {
  finance: [
    "كم إجمالي المصروفات هذا الشهر؟",
    "صرفنا كام هذا الشهر؟",
    "ما أعلى نوع مصروف هذا الشهر؟",
    "أكبر بند مصروف إيه هذا الشهر؟",
    "اعرض أعلى 5 أنواع مصروف هذا الشهر",
    "قارن مصروفات هذا الشهر بالشهر الماضي",
    "ما إجمالي المصروفات الشهر الماضي؟",
    "إجمالي المصروفات اليوم كام؟",
    "اعرض أعلى 3 أنواع مصروف هذا الشهر",
  ],

  ar: [
    "ما إجمالي مستحقات العملاء؟",
    "فلوسنا عند العملاء كام؟",
    "قيمة متأخرات العملاء كام؟",
    "من أعلى عميل مديونية؟",
    "اعرض أعلى 5 عملاء مديونية",
    "اعرض أعلى 10 عملاء مديونية",
    "كم قيمة المتأخرات هذا الشهر؟",
  ],

  maintenance: [
    "كم عدد أوامر العمل المفتوحة؟",
    "كام أمر عمل مفتوح؟",
    "ما أعلى مركبة تكلفة صيانة؟",
    "أنهي عربية صيانتها أعلى؟",
    "اعرض أعلى 5 مركبات تكلفة صيانة",
    "اعرض أعلى 10 مركبات تكلفة صيانة",
    "كم عدد أوامر العمل المفتوحة هذا الشهر؟",
  ],

  inventory: [
    "ما أكثر قطع الغيار صرفاً؟",
    "أكثر صنف بيتصرف إيه؟",
    "اعرض أعلى 5 أصناف صرفًا",
    "اعرض أعلى 10 أصناف صرفًا",
    "ما الأصناف القريبة من النفاد؟",
    "إيه الأصناف اللي قربت تخلص؟",
    "كام عدد الأصناف منخفضة المخزون؟",
  ],
};

function getRoleSections(role) {
  const r = roleUpper(role);

  if (r === "ADMIN") return ["finance", "ar", "maintenance", "inventory"];
  if (r === "ACCOUNTANT") return ["finance", "ar"];
  if (r === "STOREKEEPER") return ["inventory"];
  if (r === "FIELD_SUPERVISOR") return ["finance", "maintenance"];
  if (r === "HR") return ["maintenance"];

  return ["maintenance", "inventory"];
}

function getSuggestedQuestions({ user, context = null }) {
  const role = roleUpper(user?.role);
  const allowedSections = getRoleSections(role);
  const normalizedContext = normalizeContext(context);

  if (normalizedContext && allowedSections.includes(normalizedContext)) {
    return dedupe(SUGGESTIONS[normalizedContext] || []).slice(0, 10);
  }

  const all = [];
  for (const section of allowedSections) {
    all.push(...(SUGGESTIONS[section] || []));
  }

  return dedupe(all).slice(0, 14);
}

module.exports = {
  getSuggestedQuestions,
};