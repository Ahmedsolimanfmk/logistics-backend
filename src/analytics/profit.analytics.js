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

module.exports = {
  getClientProfitSummary,
};