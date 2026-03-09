const analyticsService = require("../analytics/analytics.service");
const { interpretQuestion } = require("./ai-analytics.interpreter");
const { buildArabicAnswer } = require("./ai-analytics.answer");
const { getSuggestedQuestions } = require("./ai-analytics.suggestions");
const { buildInsightsByContext } = require("./ai-analytics.insights");

async function queryAiAnalytics({ user, body }) {
  const question = String(body?.question || "").trim();

  if (!question) {
    const err = new Error("question is required");
    err.status = 400;
    throw err;
  }

  const interpreted = interpretQuestion(question);

  if (!interpreted || interpreted.intent === "unknown") {
    return {
      ok: true,
      intent: interpreted,
      result: null,
      answer: "السؤال غير مدعوم حاليًا في النسخة الأولى من المساعد الذكي.",
    };
  }

  let result = null;

  if (interpreted.intent === "expense_summary") {
    result = await analyticsService.getFinanceExpenseSummary({
      user,
      query: { range: interpreted.range },
    });
  } else if (interpreted.intent === "expense_by_type") {
    result = await analyticsService.getFinanceExpenseByType({
      user,
      query: { range: interpreted.range },
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
    question,
    interpreted,
    result,
  });

  return {
    ok: true,
    intent: interpreted,
    result,
    answer,
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