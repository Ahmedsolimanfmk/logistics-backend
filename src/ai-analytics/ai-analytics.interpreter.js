const {
  extractVehicleHint,
  extractTripHint,
  extractWorkOrderHint,
  extractAmount,
  extractExpenseType,
  extractTitle,
  extractVendorName,
  extractPaidMethod,
} = require("./ai-analytics.actions");

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

function detectAction(question, body = {}) {
  const text = normalizeArabic(question);

  if (
    hasAny(text, [
      "انشئ امر عمل",
      "أنشئ أمر عمل",
      "افتح امر عمل",
      "اعمل امر عمل",
      "اعمل أمر عمل",
      "create work order",
    ])
  ) {
    return {
      mode: "action",
      domain: "maintenance",
      action: "create_work_order",
      confidence: 0.95,
      auto_execute: Boolean(body?.auto_execute),
      payload: {
        vehicle_hint: extractVehicleHint(question),
        title: extractTitle(question),
        notes: String(question || "").trim(),
      },
    };
  }

  if (
    hasAny(text, [
      "افتح طلب صيانه",
      "افتح طلب صيانة",
      "انشئ طلب صيانه",
      "أنشئ طلب صيانة",
      "اعمل طلب صيانه",
      "اعمل طلب صيانة",
      "create maintenance request",
    ])
  ) {
    return {
      mode: "action",
      domain: "maintenance",
      action: "create_maintenance_request",
      confidence: 0.95,
      auto_execute: Boolean(body?.auto_execute),
      payload: {
        vehicle_hint: extractVehicleHint(question),
        description: extractTitle(question) || String(question || "").trim(),
        title: extractTitle(question),
      },
    };
  }

  if (
    hasAny(text, [
      "سجل مصروف",
      "اضف مصروف",
      "أضف مصروف",
      "انشئ مصروف",
      "أنشئ مصروف",
      "اعمل مصروف",
      "create expense",
    ]) ||
    (hasAny(text, ["مصروف"]) &&
      hasAny(text, ["وقود", "صيانة", "زيت", "كاوتش", "شراء", "نثرية"]))
  ) {
    return {
      mode: "action",
      domain: "finance",
      action: "create_expense",
      confidence: 0.94,
      auto_execute: Boolean(body?.auto_execute),
      payload: {
        amount: extractAmount(question),
        expense_type: extractExpenseType(question),
        vehicle_hint: extractVehicleHint(question),
        trip_hint: extractTripHint(question),
        work_order_hint: extractWorkOrderHint(question),
        vendor_name: extractVendorName(question),
        paid_method: extractPaidMethod(question),
        payment_source: body?.payment_source || null,
        cash_advance_id: body?.cash_advance_id || null,
        trip_id: body?.trip_id || null,
        maintenance_work_order_id: body?.maintenance_work_order_id || null,
        receipt_url: body?.receipt_url || null,
        invoice_no: body?.invoice_no || null,
        invoice_date: body?.invoice_date || null,
        vat_amount: body?.vat_amount || null,
        invoice_total: body?.invoice_total || null,
        notes: String(question || "").trim(),
      },
    };
  }

  return null;
}

function interpretQuestion(question, body = {}) {
  const actionDetected = detectAction(question, body);
  if (actionDetected) return actionDetected;

  const text = normalizeArabic(question);
  const range = detectRange(text);
  const limit = detectLimit(text);
  const qType = detectQuestionType(text);

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