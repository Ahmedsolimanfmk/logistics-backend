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

function detectLimit(q) {
  const text = normalizeArabic(q);

  const m = text.match(/\b(\d+)\b/);
  if (!m) return undefined;

  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;

  return Math.max(1, Math.min(50, n));
}

function interpretQuestion(question) {
  const text = normalizeArabic(question);
  const range = detectRange(text);
  const limit = detectLimit(text);

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

  if (
    text.includes("وزع المصروفات") ||
    text.includes("توزيع المصروفات") ||
    text.includes("المصروفات حسب النوع") ||
    text.includes("اكثر بند مصروف") ||
    text.includes("اعلى بند مصروف")
  ) {
    return {
      domain: "finance",
      intent: "expense_by_type",
      range,
      confidence: 0.9,
    };
  }

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

  if (
    text.includes("اعلى العملاء مديونيه") ||
    text.includes("اعلي العملاء مديونيه") ||
    text.includes("اكثر العملاء مديونيه") ||
    text.includes("العملاء الاعلى مديونيه") ||
    text.includes("اعلى المدينين") ||
    text.includes("اعلي المدينين")
  ) {
    return {
      domain: "ar",
      intent: "top_debtors",
      range,
      confidence: 0.88,
      limit: limit || 5,
    };
  }

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

  if (
    text.includes("اكثر القطع صرفا") ||
    text.includes("اعلى القطع صرفا") ||
    text.includes("اعلي القطع صرفا") ||
    text.includes("الاكثر صرفا من المخزن") ||
    text.includes("top issued parts")
  ) {
    return {
      domain: "inventory",
      intent: "top_issued_parts",
      range,
      confidence: 0.87,
      limit: limit || 5,
    };
  }

  if (
    text.includes("القطع القريبه من النفاد") ||
    text.includes("القطع القريبة من النفاد") ||
    text.includes("الاصناف القريبه من النفاد") ||
    text.includes("الاصناف القريبة من النفاد") ||
    text.includes("الحد الادنى للمخزون") ||
    text.includes("low stock")
  ) {
    return {
      domain: "inventory",
      intent: "low_stock_items",
      range: null,
      confidence: 0.87,
      limit: limit || 10,
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