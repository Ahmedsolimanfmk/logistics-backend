const analyticsService = require("../analytics/analytics.service");
const { interpretQuestion } = require("./ai-analytics.interpreter");
const { buildArabicAnswer } = require("./ai-analytics.answer");
const { getSuggestedQuestions } = require("./ai-analytics.suggestions");
const { buildInsightsByContext } = require("./ai-analytics.insights");
const { getFollowUpQuestions } = require("./ai-analytics.followups");

async function buildExpenseCompareResult({ user }) {
  const [thisMonth, lastMonth] = await Promise.all([
    analyticsService.getFinanceExpenseSummary({
      user,
      query: { range: "this_month" },
    }),
    analyticsService.getFinanceExpenseSummary({
      user,
      query: { range: "last_month" },
    }),
  ]);

  const thisMonthTotal = Number(
    thisMonth?.data?.total_expense ??
      thisMonth?.total_expense ??
      thisMonth?.data?.total ??
      thisMonth?.total ??
      0
  );

  const lastMonthTotal = Number(
    lastMonth?.data?.total_expense ??
      lastMonth?.total_expense ??
      lastMonth?.data?.total ??
      lastMonth?.total ??
      0
  );

  return {
    data: {
      this_month_total: thisMonthTotal,
      last_month_total: lastMonthTotal,
      difference: thisMonthTotal - lastMonthTotal,
    },
  };
}

async function queryAiAnalytics({ user, body }) {
  const question = String(body?.question || "").trim();

  if (!question) {
    const err = new Error("question is required");
    err.status = 400;
    throw err;
  }

  const interpreted = interpretQuestion(question);

  if (!interpreted || interpreted.mode === "unknown" || interpreted.intent === "unknown") {
    return {
      ok: true,
      intent: interpreted,
      result: null,
      answer: "السؤال غير مدعوم حاليًا في النسخة الحالية من المساعد الذكي. استخدم أحد الأسئلة المدعومة الظاهرة داخل القسم.",
      followUps: [
        "كم إجمالي المصروفات هذا الشهر؟",
        "من أعلى عميل مديونية؟",
        "كم عدد أوامر العمل المفتوحة؟",
        "ما الأصناف القريبة من النفاد؟",
      ],
    };
  }

  let result = null;

  if (interpreted.intent === "expense_summary_compare") {
    result = await buildExpenseCompareResult({ user });
  } else if (interpreted.intent === "expense_summary") {
    result = await analyticsService.getFinanceExpenseSummary({
      user,
      query: { range: interpreted.range },
    });
  } else if (interpreted.intent === "expense_by_type") {
    result = await analyticsService.getFinanceExpenseByType({
      user,
      query: { range: interpreted.range, limit: interpreted.limit || 5 },
    });
  } else if (interpreted.intent === "outstanding_summary") {
    result = await analyticsService.getArOutstandingSummary({
      user,
      query: { range: interpreted.range },
    });
  } else if (interpreted.intent === "top_debtors") {
    result = await analyticsService.getArTopDebtors({
      user,
      query: {
        range: interpreted.range,
        limit: interpreted.limit || 5,
      },
    });
  } else if (interpreted.intent === "open_work_orders") {
    result = await analyticsService.getMaintenanceOpenWorkOrders({
      user,
      query: { range: interpreted.range },
    });
  } else if (interpreted.intent === "maintenance_cost_by_vehicle") {
    result = await analyticsService.getMaintenanceCostByVehicle({
      user,
      query: {
        range: interpreted.range,
        limit: interpreted.limit || 5,
      },
    });
  } else if (interpreted.intent === "top_issued_parts") {
    result = await analyticsService.getInventoryTopIssuedParts({
      user,
      query: {
        range: interpreted.range,
        limit: interpreted.limit || 5,
      },
    });
  } else if (interpreted.intent === "low_stock_items") {
    result = await analyticsService.getInventoryLowStockItems({
      user,
      query: {
        limit: interpreted.limit || 10,
      },
    });
  }

  const answer = buildArabicAnswer({
    interpreted,
    result,
  });

  const followUps = getFollowUpQuestions({
    interpreted,
    result,
  });

  return {
    ok: true,
    intent: interpreted,
    result,
    answer,
    followUps,
  };
}

async function getAiSuggestedQuestions({ user, query }) {
  const context = String(query?.context || "").trim().toLowerCase() || null;

  const questions = getSuggestedQuestions({
    user,
    context,
  });

  return {
    ok: true,
    context,
    questions,
  };
}

async function getAiInsights({ user, query }) {
  const context = String(query?.context || "").trim().toLowerCase() || null;

  const data = {};

  if (!context || context === "finance") {
    data.expenseSummary = await analyticsService.getFinanceExpenseSummary({
      user,
      query: { range: "this_month" },
    });

    data.expenseByType = await analyticsService.getFinanceExpenseByType({
      user,
      query: { range: "this_month" },
    });
  }

  if (!context || context === "ar") {
    data.outstandingSummary = await analyticsService.getArOutstandingSummary({
      user,
      query: { range: "this_month" },
    });

    data.topDebtors = await analyticsService.getArTopDebtors({
      user,
      query: {
        range: "this_month",
        limit: 5,
      },
    });
  }

  if (!context || context === "maintenance") {
    data.openWorkOrders = await analyticsService.getMaintenanceOpenWorkOrders({
      user,
      query: { range: "this_month" },
    });

    data.costByVehicle = await analyticsService.getMaintenanceCostByVehicle({
      user,
      query: {
        range: "this_month",
        limit: 5,
      },
    });
  }

  if (!context || context === "inventory") {
    data.topIssuedParts = await analyticsService.getInventoryTopIssuedParts({
      user,
      query: {
        range: "this_month",
        limit: 5,
      },
    });

    data.lowStockItems = await analyticsService.getInventoryLowStockItems({
      user,
      query: {
        limit: 10,
      },
    });
  }

  const insights = buildInsightsByContext({
    context,
    data,
  });

  return {
    ok: true,
    context,
    insights,
  };
}

module.exports = {
  queryAiAnalytics,
  getAiSuggestedQuestions,
  getAiInsights,
};