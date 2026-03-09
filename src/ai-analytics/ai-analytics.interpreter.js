function normalizeArabic(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function detectRange(q) {
  const text = normalizeArabic(q);

  if (text.includes("اليوم")) return "today";
  if (text.includes("هذا الشهر") || text.includes("الشهر الحالي")) return "this_month";
  if (text.includes("الشهر الماضي")) return "last_month";
  if (text.includes("اخر 30 يوم") || text.includes("آخر 30 يوم")) return "last_30_days";

  return "this_month";
}

function interpretQuestion(question) {
  const text = normalizeArabic(question);
  const range = detectRange(text);

  // Finance - expense summary
  if (
    text.includes("اجمالي المصروفات") ||
    text.includes("كم المصروفات") ||
    text.includes("مصروفات هذا الشهر")
  ) {
    return {
      domain: "finance",
      intent: "expense_summary",
      range,
      confidence: 0.9,
    };
  }

  // Finance - expense by type
  if (
    text.includes("وزع المصروفات") ||
    text.includes("توزيع المصروفات") ||
    text.includes("المصروفات حسب النوع") ||
    text.includes("اكثر بند مصروف")
  ) {
    return {
      domain: "finance",
      intent: "expense_by_type",
      range,
      confidence: 0.9,
    };
  }

  // AR outstanding summary
  if (
    text.includes("اجمالي المستحقات") ||
    text.includes("مستحقات العملاء") ||
    text.includes("مديونيات العملاء")
  ) {
    return {
      domain: "ar",
      intent: "outstanding_summary",
      range,
      confidence: 0.88,
    };
  }

  // AR top debtors
  if (
    text.includes("اعلى العملاء مديونيه") ||
    text.includes("اعلي العملاء مديونيه") ||
    text.includes("اكثر العملاء مديونيه") ||
    text.includes("العملاء الاعلى مديونيه")
  ) {
    return {
      domain: "ar",
      intent: "top_debtors",
      range,
      confidence: 0.88,
      limit: 5,
    };
  }

  // Maintenance open work orders
  if (
    text.includes("اوامر العمل المفتوحه") ||
    text.includes("اوامر العمل المفتوحة") ||
    text.includes("عدد اوامر العمل المفتوحه") ||
    text.includes("كم امر عمل مفتوح")
  ) {
    return {
      domain: "maintenance",
      intent: "open_work_orders",
      range,
      confidence: 0.87,
    };
  }

  return {
    domain: "unknown",
    intent: "unknown",
    range,
    confidence: 0,
  };
}

module.exports = {
  interpretQuestion,
};