function normalizeArabicText(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
    .replace(/\s+/g, " ");
}

function toRawText(value) {
  return String(value || "").trim();
}

function cleanExtractedHint(value) {
  return String(value || "")
    .trim()
    .replace(
      /\s+(خلال|هذا|هاذا|لهذا|في|الى|إلى|عن|بسبب|مع|للشهر|هذا الشهر|الشهر الحالي|هذا الاسبوع|هذا الأسبوع)\b.*$/i,
      ""
    )
    .trim();
}

function matchFirst(raw, patterns = []) {
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      const value = cleanExtractedHint(match[1]);
      if (value) return value;
    }
  }
  return null;
}

function extractAmount(question) {
  const text = normalizeArabicText(question).replace(/,/g, "");
  const match = text.match(/(\d+(?:\.\d+)?)\s*(جنيه|ج|egp)?/i);

  if (!match) return null;

  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function extractVehicleHint(question) {
  const raw = toRawText(question);

  return matchFirst(raw, [
    /(?:للمركبه|للمركبة|للعربيه|للعربية|للسياره|للسيارة)\s+([^\n\r,.]+)/i,
    /(?:المركبه|المركبة|العربيه|العربية|السياره|السيارة)\s+([^\n\r,.]+)/i,
  ]);
}

function extractClientHint(question) {
  const raw = toRawText(question);

  return matchFirst(raw, [
    /(?:للعميل|لعميل|عميل|العميل|client|clients)\s+([^\n\r,.]+)/i,
    /(?:رحلات العميل|رحلات لعميل|trips for client)\s+([^\n\r,.]+)/i,
  ]);
}

function extractSiteHint(question) {
  const raw = toRawText(question);

  return matchFirst(raw, [
    /(?:للموقع|لموقع|موقع|الموقع|site|sites)\s+([^\n\r,.]+)/i,
    /(?:رحلات الموقع|رحلات لموقع|trips for site)\s+([^\n\r,.]+)/i,
    /(?:الى موقع|إلى موقع)\s+([^\n\r,.]+)/i,
  ]);
}

function extractTripHint(question) {
  const raw = toRawText(question);

  return matchFirst(raw, [
    /(?:الرحله|الرحلة|trip)\s+([^\n\r,.]+)/i,
    /(?:على الرحله|على الرحلة|for trip)\s+([^\n\r,.]+)/i,
  ]);
}

function extractWorkOrderHint(question) {
  const raw = toRawText(question);

  return matchFirst(raw, [
    /(?:امر العمل|أمر العمل|work order)\s+([^\n\r,.]+)/i,
    /(?:على امر العمل|على أمر العمل|for work order)\s+([^\n\r,.]+)/i,
  ]);
}

function extractExpenseType(question) {
  const text = normalizeArabicText(question);

  if (text.includes("وقود") || text.includes("سولار") || text.includes("بنزين")) {
    return "FUEL";
  }

  if (text.includes("صيانه") || text.includes("صيانة")) {
    return "MAINTENANCE";
  }

  if (
    text.includes("رسوم") ||
    text.includes("بوابه") ||
    text.includes("بوابة") ||
    text.includes("toll")
  ) {
    return "TOLL";
  }

  if (text.includes("سائق") || text.includes("بدل سائق")) {
    return "DRIVER_ALLOWANCE";
  }

  if (text.includes("تحميل")) {
    return "LOADING";
  }

  if (text.includes("تنزيل") || text.includes("تفريغ")) {
    return "UNLOADING";
  }

  if (
    text.includes("قطع غيار") ||
    text.includes("شراء قطع") ||
    text.includes("كاوتش") ||
    text.includes("زيت")
  ) {
    return "PARTS_PURCHASE";
  }

  if (
    text.includes("طارئ") ||
    text.includes("طارئه") ||
    text.includes("طارئة") ||
    text.includes("emergency")
  ) {
    return "EMERGENCY";
  }

  return "OTHER";
}

function extractTitle(question) {
  const raw = toRawText(question);

  const match =
    raw.match(/(?:يوجد|بسبب|بعنوان)\s+([^\n\r]+)/i) ||
    raw.match(/(?:عنوانه|اسمها|اسم المشكلة)\s+([^\n\r]+)/i);

  if (match?.[1]) {
    const value = String(match[1]).trim();
    if (value) return value.slice(0, 160);
  }

  return raw ? raw.slice(0, 160) : null;
}

function extractVendorName(question) {
  const raw = toRawText(question);

  return matchFirst(raw, [
    /(?:من مورد|من المورد|vendor|supplier)\s+([^\n\r,.]+)/i,
  ]);
}

function extractPaidMethod(question) {
  const text = normalizeArabicText(question);

  if (text.includes("تحويل") || text.includes("بنكي")) return "BANK_TRANSFER";
  if (text.includes("كاش") || text.includes("نقد")) return "CASH";
  if (text.includes("شيك")) return "CHEQUE";
  if (
    text.includes("بطاقه") ||
    text.includes("بطاقة") ||
    text.includes("فيزا") ||
    text.includes("ماستر")
  ) {
    return "CARD";
  }

  return "OTHER";
}

module.exports = {
  normalizeArabicText,
  extractVehicleHint,
  extractClientHint,
  extractSiteHint,
  extractTripHint,
  extractWorkOrderHint,
  extractAmount,
  extractExpenseType,
  extractTitle,
  extractVendorName,
  extractPaidMethod,
};