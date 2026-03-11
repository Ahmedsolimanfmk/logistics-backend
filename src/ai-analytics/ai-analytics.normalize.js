function toEnglishDigits(input) {
  const ar = "٠١٢٣٤٥٦٧٨٩";
  return String(input || "").replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)));
}

function removeDiacritics(input) {
  return String(input || "").replace(/[\u064B-\u065F\u0670]/g, "");
}

function normalizeArabicBasic(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "");
}

function stripPunctuation(input) {
  return String(input || "").replace(/[؟?!.,،;:;"'`()\[\]{}<>|\\/]+/g, " ");
}

function normalizeWhitespace(input) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function normalizeArabicText(input) {
  const raw = String(input || "");
  const normalized = normalizeWhitespace(
    stripPunctuation(
      normalizeArabicBasic(removeDiacritics(toEnglishDigits(raw)))
    )
  );

  return normalized;
}

function tokenizeArabic(input) {
  const normalized = normalizeArabicText(input);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean);
}

function normalizeList(items = []) {
  return items
    .map((x) => normalizeArabicText(x))
    .filter(Boolean);
}

function includesAny(text, candidates = []) {
  const normalized = normalizeArabicText(text);
  if (!normalized) return false;

  const normalizedCandidates = normalizeList(candidates);
  return normalizedCandidates.some((candidate) => normalized.includes(candidate));
}

function includesAll(text, candidates = []) {
  const normalized = normalizeArabicText(text);
  if (!normalized) return false;

  const normalizedCandidates = normalizeList(candidates);
  if (!normalizedCandidates.length) return false;

  return normalizedCandidates.every((candidate) => normalized.includes(candidate));
}

module.exports = {
  toEnglishDigits,
  removeDiacritics,
  normalizeArabicBasic,
  stripPunctuation,
  normalizeWhitespace,
  normalizeArabicText,
  tokenizeArabic,
  normalizeList,
  includesAny,
  includesAll,
};