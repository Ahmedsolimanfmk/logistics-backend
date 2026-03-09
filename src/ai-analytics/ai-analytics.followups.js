function uniqueQuestions(items = []) {
  return Array.from(
    new Set(
      items
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  );
}

function getFollowUpQuestions({ interpreted }) {
  const intent = interpreted?.intent;
  const limit = Number(interpreted?.limit || 0);

  if (intent === "expense_summary_compare") {
    return uniqueQuestions([
      "كم إجمالي المصروفات هذا الشهر؟",
      "ما إجمالي المصروفات الشهر الماضي؟",
      "اعرض أعلى 5 أنواع مصروف هذا الشهر",
      "ما أعلى نوع مصروف هذا الشهر؟",
    ]);
  }

  if (intent === "expense_summary") {
    return uniqueQuestions([
      "ما أعلى نوع مصروف هذا الشهر؟",
      "أكبر بند مصروف إيه هذا الشهر؟",
      "اعرض أعلى 5 أنواع مصروف هذا الشهر",
      "قارن مصروفات هذا الشهر بالشهر الماضي",
    ]);
  }

  if (intent === "expense_by_type") {
    return uniqueQuestions([
      "كم إجمالي المصروفات هذا الشهر؟",
      "صرفنا كام هذا الشهر؟",
      "قارن مصروفات هذا الشهر بالشهر الماضي",
      limit > 1 ? "ما أعلى نوع مصروف هذا الشهر؟" : "اعرض أعلى 5 أنواع مصروف هذا الشهر",
    ]);
  }

  if (intent === "outstanding_summary") {
    return uniqueQuestions([
      "قيمة متأخرات العملاء كام؟",
      "من أعلى عميل مديونية؟",
      "اعرض أعلى 5 عملاء مديونية",
      "فلوسنا عند العملاء كام؟",
    ]);
  }

  if (intent === "top_debtors") {
    return uniqueQuestions([
      "ما إجمالي مستحقات العملاء؟",
      "فلوسنا عند العملاء كام؟",
      "قيمة متأخرات العملاء كام؟",
      limit > 1 ? "من أعلى عميل مديونية؟" : "اعرض أعلى 5 عملاء مديونية",
    ]);
  }

  if (intent === "open_work_orders") {
    return uniqueQuestions([
      "ما أعلى مركبة تكلفة صيانة؟",
      "اعرض أعلى 5 مركبات تكلفة صيانة",
      "ما أكثر قطع الغيار صرفاً؟",
      "إيه الأصناف اللي قربت تخلص؟",
    ]);
  }

  if (intent === "maintenance_cost_by_vehicle") {
    return uniqueQuestions([
      "كم عدد أوامر العمل المفتوحة؟",
      "كام أمر عمل مفتوح؟",
      limit > 1 ? "ما أعلى مركبة تكلفة صيانة؟" : "اعرض أعلى 5 مركبات تكلفة صيانة",
      "ما أكثر قطع الغيار صرفاً؟",
    ]);
  }

  if (intent === "top_issued_parts") {
    return uniqueQuestions([
      "ما الأصناف القريبة من النفاد؟",
      "إيه الأصناف اللي قربت تخلص؟",
      "كام عدد الأصناف منخفضة المخزون؟",
      limit > 1 ? "ما أكثر قطع الغيار صرفاً؟" : "اعرض أعلى 5 أصناف صرفًا",
    ]);
  }

  if (intent === "low_stock_items") {
    return uniqueQuestions([
      "ما أكثر قطع الغيار صرفاً؟",
      "أكثر صنف بيتصرف إيه؟",
      "اعرض أعلى 5 أصناف صرفًا",
      "كم عدد أوامر العمل المفتوحة؟",
    ]);
  }

  return uniqueQuestions([
    "كم إجمالي المصروفات هذا الشهر؟",
    "من أعلى عميل مديونية؟",
    "كم عدد أوامر العمل المفتوحة؟",
    "ما الأصناف القريبة من النفاد؟",
  ]);
}

module.exports = {
  getFollowUpQuestions,
};