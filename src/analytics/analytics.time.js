function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function endOfYear(d) {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function parseDateInput(v) {
  if (!v) return null;

  const raw = String(v).trim();
  if (!raw) return null;

  const normalized = raw.replace(/\//g, "-");
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return null;
  }

  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;

  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }

  return dt;
}

function resolveCustomRange(query = {}) {
  const fromRaw = query.date_from || query.from || null;
  const toRaw = query.date_to || query.to || null;

  const fromDate = parseDateInput(fromRaw);
  const toDate = parseDateInput(toRaw);

  if (!fromDate || !toDate) return null;
  if (fromDate > toDate) return null;

  return {
    from: startOfDay(fromDate),
    to: endOfDay(toDate),
    key: "custom",
  };
}

function resolveDynamicLastDays(range, now) {
  const m = String(range || "").match(/^last_(\d+)_days$/);
  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;

  const from = new Date(now);
  from.setDate(from.getDate() - n + 1);

  return {
    from: startOfDay(from),
    to: endOfDay(now),
    key: `last_${n}_days`,
  };
}

function resolveTimeRange(query = {}) {
  const now = new Date();
  const range = String(query.range || "this_month").trim().toLowerCase();

  const custom = resolveCustomRange(query);
  if (custom) return custom;

  const dynamicLastDays = resolveDynamicLastDays(range, now);
  if (dynamicLastDays) return dynamicLastDays;

  if (range === "today") {
    return {
      from: startOfDay(now),
      to: endOfDay(now),
      key: "today",
    };
  }

  if (range === "this_week") {
    return {
      from: startOfWeek(now),
      to: endOfDay(now),
      key: "this_week",
    };
  }

  if (range === "last_week") {
    const ref = startOfWeek(now);
    ref.setDate(ref.getDate() - 7);

    return {
      from: startOfWeek(ref),
      to: endOfWeek(ref),
      key: "last_week",
    };
  }

  if (range === "last_7_days") {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);

    return {
      from: startOfDay(from),
      to: endOfDay(now),
      key: "last_7_days",
    };
  }

  if (range === "last_30_days") {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);

    return {
      from: startOfDay(from),
      to: endOfDay(now),
      key: "last_30_days",
    };
  }

  if (range === "last_90_days") {
    const from = new Date(now);
    from.setDate(from.getDate() - 89);

    return {
      from: startOfDay(from),
      to: endOfDay(now),
      key: "last_90_days",
    };
  }

  if (range === "last_month") {
    const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      from: startOfMonth(ref),
      to: endOfMonth(ref),
      key: "last_month",
    };
  }

  if (range === "this_year") {
    return {
      from: startOfYear(now),
      to: endOfDay(now),
      key: "this_year",
    };
  }

  if (range === "last_year") {
    const ref = new Date(now.getFullYear() - 1, 0, 1);
    return {
      from: startOfYear(ref),
      to: endOfYear(ref),
      key: "last_year",
    };
  }

  return {
    from: startOfMonth(now),
    to: endOfDay(now),
    key: "this_month",
  };
}

module.exports = {
  resolveTimeRange,
  parseDateInput,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
};