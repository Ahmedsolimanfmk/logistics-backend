function normalizeArabic(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
    .replace(/\s+/g, " ");
}

function hasAny(text, words = []) {
  return words.some((w) => text.includes(normalizeArabic(w)));
}

function detectRange(q) {
  const text = normalizeArabic(q);

  if (hasAny(text, ["اليوم", "النهارده", "النهاردة"])) return "today";

  if (
    hasAny(text, [
      "هذا الشهر",
      "الشهر الحالي",
      "الشهر ده",
      "الشهر دا",
      "الشهر الجاري",
    ])
  ) {
    return "this_month";
  }

  if (
    hasAny(text, [
      "الشهر الماضي",
      "الشهر اللي فات",
      "الشهر السابق",
      "الشهر الفات",
    ])
  ) {
    return "last_month";
  }

  if (
    hasAny(text, [
      "اخر 30 يوم",
      "آخر 30 يوم",
      "اخر ٣٠ يوم",
      "آخر ٣٠ يوم",
      "خلال 30 يوم",
      "خلال ٣٠ يوم",
    ])
  ) {
    return "last_30_days";
  }

  return "this_month";
}

function detectLimit(q) {
  const text = normalizeArabic(q);
  const m = text.match(/\b(\d+)\b/);

  if (!m) return undefined;

  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;

  return Math.max(1, Math.min(50, n));
}

function detectQuestionType(text) {
  if (hasAny(text, ["اعلي", "اعلى", "اكبر", "اكثر", "top"])) return "top";
  if (hasAny(text, ["كم", "كام", "عدد", "اجمالي", "إجمالي"])) return "summary";
  return "general";
}

function interpretQuestion(question) {
  const text = normalizeArabic(question);
  const range = detectRange(text);
  const limit = detectLimit(text);
  const qType = detectQuestionType(text);

  // =========================
  // Finance - compare this month vs last month
  // =========================
  if (
    (
      hasAny(text, ["مصروفات", "الصرف", "مصروف"]) &&
      hasAny(text, ["قارن", "مقارنه", "مقارنة", "فرق", "مقارنة بين"]) &&
      hasAny(text, ["هذا الشهر", "الشهر الحالي", "الشهر ده"]) &&
      hasAny(text, ["الشهر الماضي", "الشهر اللي فات", "الشهر السابق"])
    ) ||
    hasAny(text, [
      "قارن مصروفات هذا الشهر بالشهر الماضي",
      "مقارنه مصروفات هذا الشهر بالشهر الماضي",
      "فرق المصروفات بين هذا الشهر والشهر الماضي",
      "قارن الصرف هذا الشهر بالشهر الماضي",
    ])
  ) {
    return {
      mode: "query",
      domain: "finance",
      intent: "expense_summary_compare",
      range: "compare_this_vs_last_month",
      confidence: 0.95,
    };
  }

  // =========================
  // Finance - expense summary
  // =========================
  if (
    hasAny(text, [
      "اجمالي المصروفات",
      "كم المصروفات",
      "كام المصروفات",
      "صرفنا كام",
      "الصرف كام",
      "مصروفاتنا كام",
      "تكلفه المصروفات",
      "تكلفه الشهر",
      "تكلفه هذا الشهر",
      "مصروفات هذا الشهر",
      "اجمالي الصرف",
      "الاجمالي المصروف",
    ]) ||
    (text.includes("مصروفات") && hasAny(text, ["اجمالي", "كم", "كام"])) ||
    (text.includes("الصرف") && hasAny(text, ["اجمالي", "كم", "كام"]))
  ) {
    return {
      mode: "query",
      domain: "finance",
      intent: "expense_summary",
      range,
      confidence: 0.92,
    };
  }

  // =========================
  // Finance - expense by type
  // =========================
  if (
    hasAny(text, [
      "وزع المصروفات",
      "توزيع المصروفات",
      "المصروفات حسب النوع",
      "المصروفات حسب البند",
      "اعلى نوع مصروف",
      "اعلى بند مصروف",
      "اكبر بند مصروف",
      "اكثر نوع مصروف",
      "اكثر بند مصروف",
      "اكبر نوع مصروف",
      "ما نوع المصروف الاعلى",
      "ما البند الاعلى",
      "اعرض اعلى انواع المصروف",
      "اعرض اعلى بنود المصروف",
      "اعرض اعلى 5 انواع مصروف",
      "اعرض اعلى 5 بنود مصروف",
    ]) ||
    (text.includes("مصروفات") && hasAny(text, ["النوع", "بند"])) ||
    (text.includes("مصروف") && hasAny(text, ["نوع", "بند", "اعلى", "اكثر", "اكبر"]))
  ) {
    return {
      mode: "query",
      domain: "finance",
      intent: "expense_by_type",
      range,
      confidence: 0.92,
      limit: limit || (qType === "top" ? 5 : 1),
    };
  }

  // =========================
  // AR - outstanding summary
  // =========================
  if (
    hasAny(text, [
      "اجمالي المستحقات",
      "مستحقات العملاء",
      "مديونيات العملاء",
      "فلوسنا عند العملاء",
      "حقنا عند العملاء",
      "العملاء عليهم كام",
      "كم مستحقات العملاء",
      "كام مستحقات العملاء",
      "اجمالي مديونيه العملاء",
      "اجمالي مديونية العملاء",
    ]) ||
    (text.includes("مستحقات") && hasAny(text, ["العملاء", "عملاء"])) ||
    (text.includes("مديوني") && hasAny(text, ["العملاء", "عملاء"]))
  ) {
    return {
      mode: "query",
      domain: "ar",
      intent: "outstanding_summary",
      range,
      confidence: 0.9,
      focus: "summary",
    };
  }

  // =========================
  // AR - overdue only
  // =========================
  if (
    hasAny(text, [
      "متاخرات العملاء",
      "متأخرات العملاء",
      "كم المتاخرات",
      "كام المتاخرات",
      "قيمة المتاخرات",
      "المبالغ المتاخره",
      "المبالغ المتأخرة",
      "المديونيات المتاخره",
      "المديونيات المتأخرة",
    ]) ||
    (text.includes("متاخر") && hasAny(text, ["العملاء", "عملاء", "مستحقات"]))
  ) {
    return {
      mode: "query",
      domain: "ar",
      intent: "outstanding_summary",
      range,
      confidence: 0.9,
      focus: "overdue_only",
    };
  }

  // =========================
  // AR - top debtors
  // =========================
  if (
    (
      hasAny(text, ["عميل", "العملاء", "عملاء"]) &&
      hasAny(text, ["مديونيه", "المديونيه", "المديونيات", "مستحقات"]) &&
      hasAny(text, ["اعلى", "اعلي", "اكثر", "اكبر", "top", "مين", "من"])
    ) ||
    hasAny(text, [
      "اعلى عميل مديونيه",
      "اعلى عميل مديونية",
      "اكبر عميل مديونيه",
      "اكبر عميل مديونية",
      "اكثر عميل مديونيه",
      "اكثر عميل مديونية",
      "مين اكبر عميل مديونيه",
      "مين اكبر عميل مديونية",
      "من اعلى عميل مديونيه",
      "من اعلى عميل مديونية",
    ])
  ) {
    return {
      mode: "query",
      domain: "ar",
      intent: "top_debtors",
      range,
      confidence: 0.9,
      limit: limit || (qType === "top" ? 5 : 1),
    };
  }

  // =========================
  // Maintenance - open work orders
  // =========================
  if (
    hasAny(text, [
      "اوامر العمل المفتوحه",
      "اوامر العمل المفتوحة",
      "عدد اوامر العمل المفتوحه",
      "عدد اوامر العمل المفتوحة",
      "كام امر عمل مفتوح",
      "كم امر عمل مفتوح",
      "كام اوامر صيانه مفتوحه",
      "كم اوامر صيانه مفتوحه",
      "كام امر صيانه مفتوح",
      "كم امر صيانه مفتوح",
    ]) ||
    (
      (text.includes("امر") || text.includes("اوامر")) &&
      hasAny(text, ["عمل", "صيانه", "صيانة"]) &&
      hasAny(text, ["مفتوح", "مفتوحه", "مفتوحة"])
    )
  ) {
    return {
      mode: "query",
      domain: "maintenance",
      intent: "open_work_orders",
      range,
      confidence: 0.9,
    };
  }

  // =========================
  // Maintenance - cost by vehicle
  // =========================
  if (
    (
      hasAny(text, ["تكلفه", "تكلفة", "صيانه", "صيانة"]) &&
      hasAny(text, ["مركبه", "مركبات", "عربيه", "عربيات", "سياره", "سيارات"]) &&
      hasAny(text, ["اعلى", "اعلي", "اكثر", "اكبر", "top", "مين", "ايه", "انهي"])
    ) ||
    hasAny(text, [
      "اعلى مركبه تكلفه صيانه",
      "اعلى مركبه تكلفة صيانة",
      "اعلى المركبات تكلفة صيانة",
      "اكثر مركبه تكلفة صيانه",
      "اكثر مركبه تكلفة صيانة",
      "اكبر مركبه تكلفة صيانه",
      "اكبر مركبه تكلفة صيانة",
      "انهي عربيه صيانتها اعلى",
      "انهي عربية صيانتها اعلى",
      "مين اعلى عربيه صيانه",
      "مين اعلى عربية صيانة",
    ])
  ) {
    return {
      mode: "query",
      domain: "maintenance",
      intent: "maintenance_cost_by_vehicle",
      range,
      confidence: 0.9,
      limit: limit || (qType === "top" ? 5 : 1),
    };
  }

  // =========================
  // Inventory - top issued parts
  // =========================
  if (
    (
      hasAny(text, [
        "قطع",
        "القطع",
        "قطع الغيار",
        "اصناف",
        "الاصناف",
        "اصناف المخزن",
        "الصنف",
      ]) &&
      hasAny(text, ["صرف", "صرفا", "الصرف", "بتتصرف", "المصروف"]) &&
      hasAny(text, ["اكثر", "اعلى", "اعلي", "اكبر", "top", "مين", "ايه"])
    ) ||
    hasAny(text, [
      "اكثر قطع الغيار صرفا",
      "اكثر صنف صرفا",
      "اكثر صنف بيتصرف",
      "اعلى صنف صرفا",
      "اكبر صنف صرفا",
      "top issued parts",
    ])
  ) {
    return {
      mode: "query",
      domain: "inventory",
      intent: "top_issued_parts",
      range,
      confidence: 0.9,
      limit: limit || (qType === "top" ? 5 : 1),
    };
  }

  // =========================
  // Inventory - low stock
  // =========================
  if (
    hasAny(text, [
      "القطع القريبه من النفاد",
      "القطع القريبة من النفاد",
      "الاصناف القريبه من النفاد",
      "الاصناف القريبة من النفاد",
      "الحد الادنى للمخزون",
      "تحت الحد الادنى",
      "تحت الحد الأدنى",
      "الاصناف اللي قربت تخلص",
      "القطع اللي قربت تخلص",
      "الاصناف الناقصه",
      "الاصناف منخفضه المخزون",
      "الاصناف منخفضة المخزون",
      "low stock",
    ]) ||
    (
      hasAny(text, ["نفاد", "مخزون", "تخلص", "ناقص"]) &&
      hasAny(text, ["قطع", "القطع", "اصناف", "الاصناف", "الصنف"])
    )
  ) {
    return {
      mode: "query",
      domain: "inventory",
      intent: "low_stock_items",
      range: null,
      confidence: 0.9,
      limit: limit || 10,
      focus: hasAny(text, ["كم", "كام", "عدد"]) ? "count_only" : "list",
    };
  }

  return {
    mode: "unknown",
    domain: "unknown",
    intent: "unknown",
    range,
    confidence: 0,
  };
}

module.exports = {
  interpretQuestion,
};