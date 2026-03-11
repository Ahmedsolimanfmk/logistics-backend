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

function extractAmount(question) {
  const text = normalizeArabicText(question);

  const direct = text.match(/(\d+(?:\.\d+)?)\s*(جنيه|ج|egp)?/i);
  if (direct) {
    const n = Number(direct[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

function extractVehicleHint(question) {
  const raw = String(question || "").trim();

  const patterns = [
    /(?:للمركبه|للمركبة|للعربيه|للعربية|للسياره|للسيارة)\s+([^\n\r,.]+)/i,
    /(?:المركبه|المركبة|العربيه|العربية|السياره|السيارة)\s+([^\n\r,.]+)/i,
  ];

  for (const p of patterns) {
    const m = raw.match(p);
    if (m && m[1]) return m[1].trim();
  }

  return null;
}

function extractTripHint(question) {
  const raw = String(question || "").trim();

  const patterns = [
    /(?:الرحله|الرحلة|trip)\s+([^\n\r,.]+)/i,
    /(?:على الرحله|على الرحلة|for trip)\s+([^\n\r,.]+)/i,
  ];

  for (const p of patterns) {
    const m = raw.match(p);
    if (m && m[1]) return m[1].trim();
  }

  return null;
}

function extractWorkOrderHint(question) {
  const raw = String(question || "").trim();

  const patterns = [
    /(?:امر العمل|أمر العمل|work order)\s+([^\n\r,.]+)/i,
    /(?:على امر العمل|على أمر العمل|for work order)\s+([^\n\r,.]+)/i,
  ];

  for (const p of patterns) {
    const m = raw.match(p);
    if (m && m[1]) return m[1].trim();
  }

  return null;
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
  const raw = String(question || "").trim();

  const m =
    raw.match(/(?:يوجد|بسبب|بعنوان)\s+([^\n\r]+)/i) ||
    raw.match(/(?:صيانة|صيانه)\s+([^\n\r]+)/i);

  if (m && m[1]) return m[1].trim();

  return raw || null;
}

function extractVendorName(question) {
  const raw = String(question || "").trim();

  const patterns = [
    /(?:من مورد|من المورد|من)\s+([^\n\r,.]+)/i,
    /(?:vendor|supplier)\s+([^\n\r,.]+)/i,
  ];

  for (const p of patterns) {
    const m = raw.match(p);
    if (m && m[1]) return m[1].trim();
  }

  return null;
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
  extractTripHint,
  extractWorkOrderHint,
  extractAmount,
  extractExpenseType,
  extractTitle,
  extractVendorName,
  extractPaidMethod,
};