// src/dashboard/dateRange.js
const { DateTime } = require("luxon");

const ZONE = "Africa/Cairo";

// Today range (Cairo)
exports.getCairoDayRange = (fromIso, toIso) => {
  const start = fromIso
    ? DateTime.fromISO(fromIso, { zone: ZONE })
    : DateTime.now().setZone(ZONE).startOf("day");

  const end = toIso
    ? DateTime.fromISO(toIso, { zone: ZONE })
    : DateTime.now().setZone(ZONE).endOf("day");

  return { from: start.toJSDate(), to: end.toJSDate(), zone: ZONE };
};

// This month range (Cairo)
exports.getCairoMonthRange = (fromIso, toIso) => {
  const now = DateTime.now().setZone(ZONE);

  const start = fromIso
    ? DateTime.fromISO(fromIso, { zone: ZONE })
    : now.startOf("month");

  const end = toIso
    ? DateTime.fromISO(toIso, { zone: ZONE })
    : now.endOf("month");

  return { from: start.toJSDate(), to: end.toJSDate(), zone: ZONE };
};

// Default last 14 days range (Cairo)
exports.getCairoRangeDefault14Days = (fromIso, toIso) => {
  const end = toIso
    ? DateTime.fromISO(toIso, { zone: ZONE })
    : DateTime.now().setZone(ZONE).endOf("day");

  const start = fromIso
    ? DateTime.fromISO(fromIso, { zone: ZONE })
    : end.minus({ days: 13 }).startOf("day"); // 14 days inclusive

  return { from: start.toJSDate(), to: end.toJSDate(), zone: ZONE };
};
