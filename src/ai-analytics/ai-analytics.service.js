function normalizeArabic(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function hasAny(text, words = []) {
  return words.some((w) => text.includes(normalizeArabic(w)));
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

  // expense summary
  if (
    hasAny(text, ["اجمالي المصروفات", "كم المصروفات", "مصروفات هذا الشهر"]) ||
    (text.includes("مصروفات") && hasAny(text, ["اجمالي", "كم"]))
  ) {
    return {
      domain: "finance",
      intent: "expense_summary",
      range,
      confidence: 0.9,
    };
  }

  // expense by type
  if (
    hasAny(text, ["وزع المصروفات", "توزيع المصروفات", "المصروفات حسب النوع"]) ||
    (text.includes("مصروفات") && text.includes("النوع")) ||
    (text.includes("بند") && text.includes("مصروف"))
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
    hasAny(text, ["اجمالي المستحقات", "مستحقات العملاء", "مديونيات العملاء"]) ||
    (text.includes("مستحقات") && text.includes("العملاء"))
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
    (text.includes("عميل") || text.includes("العملاء")) &&
    hasAny(text, ["مديونيه", "مديونيه"]) &&
    hasAny(text, ["اعلى", "اعلي", "اكثر"])
  ) {
    return {
      domain: "ar",
      intent: "top_debtors",
      range,
      confidence: 0.88,
      limit: limit || 5,
    };
  }

  // maintenance open work orders
  if (
    hasAny(text, ["اوامر العمل المفتوحه", "اوامر العمل المفتوحة", "عدد اوامر العمل المفتوحه"]) ||
    ((text.includes("امر") || text.includes("اوامر")) &&
      text.includes("عمل") &&
      hasAny(text, ["مفتوح", "مفتوحه", "مفتوحة"]))
  ) {
    return {
      domain: "maintenance",
      intent: "open_work_orders",
      range,
      confidence: 0.87,
    };
  }

  // inventory top issued parts
  if (
    ((text.includes("قطع") || text.includes("القطع") || text.includes("اصناف") || text.includes("الاصناف")) &&
      hasAny(text, ["صرفا", "صرف", "صرفا من المخزن", "الصرف"]) &&
      hasAny(text, ["اكثر", "اعلى", "اعلي"])) ||
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

  // inventory low stock
  if (
    hasAny(text, [
      "القطع القريبه من النفاد",
      "القطع القريبة من النفاد",
      "الاصناف القريبه من النفاد",
      "الاصناف القريبة من النفاد",
      "الحد الادنى للمخزون",
      "low stock",
    ]) ||
    ((text.includes("نفاد") || text.includes("مخزون")) &&
      (text.includes("قطع") || text.includes("اصناف") || text.includes("الاصناف")))
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