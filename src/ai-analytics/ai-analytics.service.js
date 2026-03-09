const analyticsService = require("../analytics/analytics.service");
const { interpretQuestion } = require("./ai-analytics.interpreter");
const { buildArabicAnswer } = require("./ai-analytics.answer");

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

module.exports = {
  queryAiAnalytics,
};