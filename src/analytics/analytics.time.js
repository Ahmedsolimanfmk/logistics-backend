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

function resolveTimeRange(query = {}) {
  const now = new Date();
  const range = String(query.range || "this_month");

  if (range === "today") {
    return {
      from: startOfDay(now),
      to: endOfDay(now),
      key: "today",
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

  if (range === "last_month") {
    const y = now.getFullYear();
    const m = now.getMonth();

    const from = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const to = new Date(y, m, 0, 23, 59, 59, 999);

    return {
      from,
      to,
      key: "last_month",
    };
  }

  // default = this_month
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = endOfDay(now);

  return {
    from,
    to,
    key: "this_month",
  };
}

module.exports = {
  resolveTimeRange,
};