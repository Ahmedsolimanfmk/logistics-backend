function normalizeArabicText(text) {
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

function toRawText(value) {
  return String(value || "").trim();
}

function matchFirst(raw, patterns = []) {
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      const value = String(match[1]).trim();
      if (value) return value;
    }
  }
  return null;
}

function extractAmount(question) {
  const text = normalizeArabicText(question);
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

  if (text.includes("وقود")) return "FUEL";
  if (text.includes("صيانه") || text.includes("صيانة")) return "MAINTENANCE";
  if (text.includes("زيت")) return "OIL";
  if (text.includes("كاوتش")) return "TIRES";
  if (text.includes("شراء")) return "PURCHASE";
  if (text.includes("نثريه") || text.includes("نثرية")) return "MISC";

  return null;
}

function extractTitle(question) {
  const raw = toRawText(question);

  const match =
    raw.match(/(?:يوجد|بسبب|بعنوان)\s+([^\n\r]+)/i) ||
    raw.match(/(?:صيانة|صيانه)\s+([^\n\r]+)/i);

  if (match?.[1]) {
    const value = String(match[1]).trim();
    if (value) return value;
  }

  return raw || null;
}

function extractVendorName(question) {
  const raw = toRawText(question);

  return matchFirst(raw, [
    /(?:من مورد|من المورد|من)\s+([^\n\r,.]+)/i,
    /(?:vendor|supplier)\s+([^\n\r,.]+)/i,
  ]);
}

function extractPaidMethod(question) {
  const text = normalizeArabicText(question);

  if (text.includes("تحويل") || text.includes("بنكي")) return "BANK_TRANSFER";
  if (text.includes("كاش") || text.includes("نقد")) return "CASH";
  if (text.includes("فوري")) return "FAWRY";
  if (text.includes("شيك")) return "CHEQUE";

  return null;
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