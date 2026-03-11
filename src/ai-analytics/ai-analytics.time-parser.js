const { normalizeArabicText, includesAny } = require("./ai-analytics.normalize");
const { SYNONYMS } = require("./ai-analytics.synonyms");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateLocal(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sunday
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfYear(date) {
  const d = new Date(date.getFullYear(), 0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfYear(date) {
  const d = new Date(date.getFullYear(), 11, 31);
  d.setHours(23, 59, 59, 999);
  return d;
}

function parseIsoDate(s) {
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  return d;
}

function extractExplicitDateRange(question) {
  const text = normalizeArabicText(question);

  const isoDates = [...text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  if (isoDates.length >= 2) {
    const from = parseIsoDate(isoDates[0]);
    const to = parseIsoDate(isoDates[1]);

    if (from && to) {
      return {
        range: "custom",
        date_from: formatDateLocal(from),
        date_to: formatDateLocal(to),
      };
    }
  }

  const slashDates = [...text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)].map((m) => ({
    day: Number(m[1]),
    month: Number(m[2]),
    year: Number(m[3]),
  }));

  if (slashDates.length >= 2) {
    const d1 = new Date(slashDates[0].year, slashDates[0].month - 1, slashDates[0].day);
    const d2 = new Date(slashDates[1].year, slashDates[1].month - 1, slashDates[1].day);

    if (!Number.isNaN(d1.getTime()) && !Number.isNaN(d2.getTime())) {
      return {
        range: "custom",
        date_from: formatDateLocal(d1),
        date_to: formatDateLocal(d2),
      };
    }
  }

  return null;
}

function extractLastNDays(question) {
  const text = normalizeArabicText(question);
  const m = text.match(/(?:اخر|آخر|خلال)\s+(\d+)\s+يوم/);
  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;

  const today = new Date();
  const from = addDays(today, -n + 1);

  return {
    range: `last_${n}_days`,
    date_from: formatDateLocal(from),
    date_to: formatDateLocal(today),
  };
}

function resolveTimeFilters(question) {
  const explicit = extractExplicitDateRange(question);
  if (explicit) return explicit;

  const dynamicDays = extractLastNDays(question);
  if (dynamicDays) return dynamicDays;

  const now = new Date();

  if (includesAny(question, SYNONYMS.time.today)) {
    return {
      range: "today",
      date_from: formatDateLocal(now),
      date_to: formatDateLocal(now),
    };
  }

  if (includesAny(question, SYNONYMS.time.thisWeek)) {
    return {
      range: "this_week",
      date_from: formatDateLocal(startOfWeek(now)),
      date_to: formatDateLocal(endOfWeek(now)),
    };
  }

  if (includesAny(question, SYNONYMS.time.lastWeek)) {
    const lastWeekRef = addDays(now, -7);
    return {
      range: "last_week",
      date_from: formatDateLocal(startOfWeek(lastWeekRef)),
      date_to: formatDateLocal(endOfWeek(lastWeekRef)),
    };
  }

  if (
    includesAny(question, [
      "هذه السنه",
      "هذه السنة",
      "السنه دي",
      "السنة دي",
      "السنه الحاليه",
      "السنة الحالية",
    ])
  ) {
    return {
      range: "this_year",
      date_from: formatDateLocal(startOfYear(now)),
      date_to: formatDateLocal(endOfYear(now)),
    };
  }

  if (includesAny(question, SYNONYMS.time.thisMonth)) {
    return {
      range: "this_month",
      date_from: formatDateLocal(startOfMonth(now)),
      date_to: formatDateLocal(endOfMonth(now)),
    };
  }

  if (includesAny(question, SYNONYMS.time.lastMonth)) {
    const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    return {
      range: "last_month",
      date_from: formatDateLocal(startOfMonth(lastMonthRef)),
      date_to: formatDateLocal(endOfMonth(lastMonthRef)),
    };
  }

  if (
    includesAny(question, [
      "اخر 7 ايام",
      "آخر 7 ايام",
      "اخر 7 يوم",
      "آخر 7 يوم",
      "اخر سبع ايام",
      "آخر سبع ايام",
    ])
  ) {
    return {
      range: "last_7_days",
      date_from: formatDateLocal(addDays(now, -6)),
      date_to: formatDateLocal(now),
    };
  }

  if (includesAny(question, SYNONYMS.time.last30Days)) {
    return {
      range: "last_30_days",
      date_from: formatDateLocal(addDays(now, -29)),
      date_to: formatDateLocal(now),
    };
  }

  if (
    includesAny(question, [
      "اخر 90 يوم",
      "آخر 90 يوم",
      "اخر 90 ايام",
      "آخر 90 ايام",
    ])
  ) {
    return {
      range: "last_90_days",
      date_from: formatDateLocal(addDays(now, -89)),
      date_to: formatDateLocal(now),
    };
  }

  return {
    range: "this_month",
    date_from: formatDateLocal(startOfMonth(now)),
    date_to: formatDateLocal(endOfMonth(now)),
  };
}

module.exports = {
  resolveTimeFilters,
  extractExplicitDateRange,
  extractLastNDays,
};