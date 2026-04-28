const prisma = require("../maintenance/prisma");

function toMoney(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

function normalizeHint(v) {
  return String(v || "").trim();
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

async function resolveClientIdsByHint(companyId, clientHint) {
  const hint = normalizeHint(clientHint);
  if (!hint) return null;

  const or = [{ name: { contains: hint, mode: "insensitive" } }];

  if (isUuid(hint)) {
    or.unshift({ id: hint });
  }

  const clients = await prisma.clients.findMany({
    where: {
      company_id: companyId,
      OR: or,
    },
    select: { id: true, name: true },
    take: 20,
  });

  if (!clients.length) {
    return {
      ids: ["__NO_MATCH__"],
      names: [],
    };
  }

  return {
    ids: clients.map((c) => c.id),
    names: clients.map((c) => c.name).filter(Boolean),
  };
}

async function getClientRevenueRows({ range, companyId, clientIds }) {
  return prisma.ar_invoices.findMany({
    where: {
      company_id: companyId,
      issue_date: {
        gte: range.from,
        lte: range.to,
      },
      status: {
        in: ["APPROVED", "PARTIALLY_PAID", "PAID"],
      },
      client_id: {
        in: clientIds,
      },
    },
    select: {
      id: true,
      client_id: true,
      total_amount: true,
      status: true,
      issue_date: true,
      client: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      issue_date: "desc",
    },
  });
}

async function getClientExpenseRows({ range, companyId, clientIds }) {
  const trips = await prisma.trips.findMany({
    where: {
      company_id: companyId,
      created_at: {
        gte: range.from,
        lte: range.to,
      },
      client_id: {
        in: clientIds,
      },
    },
    select: {
      id: true,
      client_id: true,
    },
    take: 5000,
  });

  const tripIds = trips.map((t) => t.id).filter(Boolean);

  if (!tripIds.length) {
    return [];
  }

  return prisma.cash_expenses.findMany({
    where: {
      company_id: companyId,
      created_at: {
        gte: range.from,
        lte: range.to,
      },
      trip_id: {
        in: tripIds,
      },
      approval_status: {
        not: "REJECTED",
      },
    },
    select: {
      id: true,
      trip_id: true,
      amount: true,
      approval_status: true,
      payment_source: true,
      expense_type: true,
      created_at: true,
    },
    orderBy: {
      created_at: "desc",
    },
  });
}

function buildReasoning({ revenue, expense, profit, margin_pct }) {
  if (revenue <= 0 && expense <= 0) {
    return {
      status: "no_activity",
      verdict: "لا توجد حركة مالية كافية للحكم على الربحية.",
      note: "لا توجد فواتير أو مصروفات ضمن الفترة المحددة.",
    };
  }

  if (revenue <= 0 && expense > 0) {
    return {
      status: "loss",
      verdict: "العميل غير مربح حاليًا.",
      note: "توجد مصروفات بدون إيراد مسجل في نفس الفترة.",
    };
  }

  if (profit > 0 && margin_pct >= 20) {
    return {
      status: "healthy_profit",
      verdict: "العميل مربح بهامش جيد.",
      note: "الإيراد يغطي المصروفات بفارق مريح.",
    };
  }

  if (profit > 0 && margin_pct >= 5) {
    return {
      status: "low_profit",
      verdict: "العميل مربح لكن الهامش منخفض.",
      note: "المصروفات تستهلك نسبة كبيرة من الإيراد.",
    };
  }

  if (profit > 0) {
    return {
      status: "very_low_profit",
      verdict: "العميل مربح بصعوبة.",
      note: "هامش الربح ضعيف جدًا ويحتاج مراجعة.",
    };
  }

  if (profit === 0) {
    return {
      status: "break_even",
      verdict: "العميل عند نقطة التعادل تقريبًا.",
      note: "الإيراد يساوي المصروفات تقريبًا.",
    };
  }

  return {
    status: "loss",
    verdict: "العميل غير مربح حاليًا.",
    note: "المصروفات أعلى من الإيراد في الفترة المحددة.",
  };
}

async function getClientProfitSummary({ companyId, range, scope, query = {} }) {
  const clientHint = normalizeHint(query?.client_hint);

  if (!clientHint) {
    return {
      metric: "client_profit_summary",
      range: {
        from: range.from,
        to: range.to,
        key: range.key,
      },
      filters: {
        company_id: companyId,
        role: scope?.role || null,
        client_hint: null,
      },
      data: {
        revenue: 0,
        expense: 0,
        profit: 0,
        margin_pct: 0,
        invoices_count: 0,
        expenses_count: 0,
        matched_clients: [],
      },
      reasoning: {
        status: "missing_client",
        verdict: "لم يتم تحديد العميل المطلوب.",
        note: "يجب تمرير client_hint لحساب الربحية.",
      },
      summary: {
        currency: "EGP",
      },
    };
  }

  
  const resolved = await resolveClientIdsByHint(companyId, clientHint);
  const clientIds = resolved?.ids || ["__NO_MATCH__"];
  const matchedClients = resolved?.names || [];

  const [revenueRows, expenseRows] = await Promise.all([
    getClientRevenueRows({ range, companyId, clientIds }),
    getClientExpenseRows({ range, companyId, clientIds }),
  ]);

  const revenue = toMoney(
    revenueRows.reduce((sum, row) => sum + Number(row?.total_amount || 0), 0)
  );

  const expense = toMoney(
    expenseRows.reduce((sum, row) => sum + Number(row?.amount || 0), 0)
  );

  const profit = toMoney(revenue - expense);
  const margin_pct = revenue > 0 ? toMoney((profit / revenue) * 100) : 0;

  const reasoning = buildReasoning({
    revenue,
    expense,
    profit,
    margin_pct,
  });

  return {
    metric: "client_profit_summary",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      company_id: companyId,
      role: scope?.role || null,
      client_hint: clientHint,
    },
    data: {
      revenue,
      expense,
      profit,
      margin_pct,
      invoices_count: revenueRows.length,
      expenses_count: expenseRows.length,
      matched_clients: matchedClients,
    },
    reasoning,
    summary: {
      currency: "EGP",
    },
  };
}
async function getTripProfitRows({ companyId, range }) {
  const trips = await prisma.trips.findMany({
    where: {
      company_id: companyId,
      created_at: {
        gte: range.from,
        lte: range.to,
      },
      status: {
        not: "CANCELLED",
      },
    },
    select: {
      id: true,
      trip_code: true,
      client_id: true,
      site_id: true,
      status: true,
      financial_status: true,
      created_at: true,
      agreed_revenue: true,
      revenue_currency: true,
      cargo_weight: true,
      client: {
        select: {
          id: true,
          name: true,
        },
      },
      site: {
        select: {
          id: true,
          name: true,
        },
      },
      trip_revenues: {
        where: {
          company_id: companyId,
        },
        orderBy: {
          entered_at: "desc",
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          entered_at: true,
        },
      },
      cash_expenses: {
        where: {
          company_id: companyId,
          approval_status: "APPROVED",
        },
        select: {
          id: true,
          amount: true,
          approval_status: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
    take: 5000,
  });

  return trips.map((trip) => {
    const approvedRevenue =
      (trip.trip_revenues || []).find((r) => r.status === "APPROVED") || null;

    const latestRevenue = (trip.trip_revenues || [])[0] || null;

    const revenueRow = approvedRevenue || latestRevenue || null;

    const revenue = toMoney(
      revenueRow ? revenueRow.amount : trip.agreed_revenue || 0
    );

    const expense = toMoney(
      (trip.cash_expenses || []).reduce(
        (sum, row) => sum + Number(row.amount || 0),
        0
      )
    );

    const profit = toMoney(revenue - expense);
    const margin_pct = revenue > 0 ? toMoney((profit / revenue) * 100) : null;

    let profit_status = "BREAK_EVEN";
    if (profit > 0) profit_status = "PROFIT";
    if (profit < 0) profit_status = "LOSS";

    return {
      trip_id: trip.id,
      trip_code: trip.trip_code || null,
      client_id: trip.client_id,
      client_name: trip.client?.name || "عميل غير معروف",
      site_id: trip.site_id,
      site_name: trip.site?.name || null,
      status: trip.status,
      financial_status: trip.financial_status,
      created_at: trip.created_at,

      revenue,
      expense,
      profit,
      margin_pct,
      profit_status,

      cargo_weight: trip.cargo_weight ? Number(trip.cargo_weight) : null,
      currency: revenueRow?.currency || trip.revenue_currency || "EGP",
    };
  });
}

async function getTripsProfitSummary({ companyId, range, scope }) {
  const rows = await getTripProfitRows({ companyId, range });

  const total_revenue = toMoney(rows.reduce((s, x) => s + x.revenue, 0));
  const total_expense = toMoney(rows.reduce((s, x) => s + x.expense, 0));
  const total_profit = toMoney(total_revenue - total_expense);

  const profitable_count = rows.filter((x) => x.profit > 0).length;
  const loss_count = rows.filter((x) => x.profit < 0).length;
  const break_even_count = rows.filter((x) => x.profit === 0).length;

  const margin_pct =
    total_revenue > 0 ? toMoney((total_profit / total_revenue) * 100) : null;

  return {
    metric: "trips_profit_summary",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      company_id: companyId,
      role: scope?.role || null,
    },
    data: {
      total_trips: rows.length,
      profitable_count,
      loss_count,
      break_even_count,
      total_revenue,
      total_expense,
      total_profit,
      margin_pct,
    },
    summary: {
      currency: "EGP",
    },
  };
}

async function getTopProfitableTrips({ companyId, range, scope, limit = 10 }) {
  const rows = await getTripProfitRows({ companyId, range });

  const items = rows
    .filter((x) => x.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit);

  return {
    metric: "top_profitable_trips",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      company_id: companyId,
      role: scope?.role || null,
      limit,
    },
    data: {
      items,
    },
    summary: {
      currency: "EGP",
      trips_count: items.length,
      total_profit: toMoney(items.reduce((s, x) => s + x.profit, 0)),
    },
  };
}

async function getWorstTrips({ companyId, range, scope, limit = 10 }) {
  const rows = await getTripProfitRows({ companyId, range });

  const items = rows
    .filter((x) => x.profit < 0)
    .sort((a, b) => a.profit - b.profit)
    .slice(0, limit);

  return {
    metric: "worst_trips_by_profit",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      company_id: companyId,
      role: scope?.role || null,
      limit,
    },
    data: {
      items,
    },
    summary: {
      currency: "EGP",
      trips_count: items.length,
      total_loss: toMoney(items.reduce((s, x) => s + x.profit, 0)),
    },
  };
}

async function getLowMarginTrips({
  companyId,
  range,
  scope,
  limit = 10,
  threshold = 10,
}) {
  const rows = await getTripProfitRows({ companyId, range });

  const items = rows
    .filter(
      (x) =>
        x.revenue > 0 &&
        x.margin_pct !== null &&
        x.margin_pct >= 0 &&
        x.margin_pct < threshold
    )
    .sort((a, b) => a.margin_pct - b.margin_pct)
    .slice(0, limit);

  return {
    metric: "low_margin_trips",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      company_id: companyId,
      role: scope?.role || null,
      limit,
      threshold,
    },
    data: {
      items,
    },
    summary: {
      currency: "EGP",
      trips_count: items.length,
      threshold,
    },
  };
}

async function getTripProfitSummary({
  companyId,
  range,
  scope,
  tripHint,
}) {
  const rows = await getTripProfitRows({ companyId, range });

  const hint = String(tripHint || "").trim();

  const found = rows.find((x) => {
    return (
      String(x.trip_id) === hint ||
      String(x.trip_code || "") === hint ||
      String(x.trip_id).includes(hint)
    );
  });

  if (!found) {
    return {
      metric: "trip_profit_summary",
      range: {
        from: range.from,
        to: range.to,
        key: range.key,
      },
      filters: {
        company_id: companyId,
        role: scope?.role || null,
        trip_hint: hint || null,
      },
      data: null,
      summary: {
        found: false,
        message: "Trip not found in selected range",
      },
    };
  }

  return {
    metric: "trip_profit_summary",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      company_id: companyId,
      role: scope?.role || null,
      trip_hint: hint,
    },
    data: found,
    summary: {
      found: true,
      currency: found.currency || "EGP",
    },
  };
}

module.exports = {
  getClientProfitSummary,
  getTripsProfitSummary,
  getTopProfitableTrips,
  getWorstTrips,
  getLowMarginTrips,
  getTripProfitSummary,
};