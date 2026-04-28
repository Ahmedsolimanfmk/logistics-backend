const analyticsService = require("../analytics/analytics.service");
const aiPersistenceService = require("./ai-persistence.service");
const { buildArabicAnswer } = require("./ai-analytics.answer");
const { getFollowUpQuestions } = require("./ai-analytics.followups");
const { executeAiAction } = require("./ai-analytics.actions");
const { buildSessionSnapshot } = require("./ai-analytics.session");
const { buildInlineInsights } = require("./ai-analytics.insights-builder");
const { buildUnknownResponse } = require("./ai-analytics.responses");
const {
  enrichSessionSnapshotWithEntities,
  handleEntityIntelligenceFollowUp,
} = require("./entity/entity-intelligence");

function parsedToAnalyticsQuery(parsed) {
  return {
    range: parsed?.filters?.range || "this_month",
    limit: parsed?.options?.limit || undefined,
    focus: parsed?.filters?.focus || null,
    date_from: parsed?.filters?.date_from || null,
    date_to: parsed?.filters?.date_to || null,
    status: parsed?.filters?.status || null,

    vehicle_hint: parsed?.entities?.vehicle_hint || null,
    client_hint: parsed?.entities?.client_hint || null,
    site_hint: parsed?.entities?.site_hint || null,
    trip_hint: parsed?.entities?.trip_hint || null,
    work_order_hint: parsed?.entities?.work_order_hint || null,

    expense_type: parsed?.entities?.expense_type || null,
    vendor_name: parsed?.entities?.vendor_name || null,
    paid_method: parsed?.entities?.paid_method || null,
  };
}

function getUserId(user) {
  return user?.id || null;
}

function buildPersistableAssistantText(response) {
  if (!response) return "";
  if (typeof response?.answer === "string" && response.answer.trim()) {
    return response.answer.trim();
  }
  if (typeof response?.ui?.summary === "string" && response.ui.summary.trim()) {
    return response.ui.summary.trim();
  }
  return "تم تنفيذ الطلب بنجاح";
}

function tryEntityFollowUp({ parsed, question, snapshot }) {
  return handleEntityIntelligenceFollowUp({
    parsed: parsed || { mode: "unknown", intent: "unknown" },
    question,
    snapshot,
  });
}

async function buildExpenseCompareResult({ companyId, user }) {
  const [thisMonth, lastMonth] = await Promise.all([
    analyticsService.getFinanceExpenseSummary({
      companyId,
      user,
      query: { range: "this_month" },
    }),
    analyticsService.getFinanceExpenseSummary({
      companyId,
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

async function executeParsedQuery({ companyId, user, parsed }) {
  const intent = parsed?.intent;
  const query = parsedToAnalyticsQuery(parsed);

  if (intent === "expense_summary_compare") {
    return buildExpenseCompareResult({ companyId, user });
  }

  const handlers = {
    expense_summary: analyticsService.getFinanceExpenseSummary,
    expense_by_type: analyticsService.getFinanceExpenseByType,
    expense_by_vehicle: analyticsService.getFinanceExpenseByVehicle,
    expense_by_payment_source: analyticsService.getFinanceExpenseByPaymentSource,
    top_vendors: analyticsService.getFinanceTopVendors,
    expense_approval_breakdown: analyticsService.getFinanceExpenseApprovalBreakdown,

    outstanding_summary: analyticsService.getArOutstandingSummary,
    top_debtors: analyticsService.getArTopDebtors,

    open_work_orders: analyticsService.getMaintenanceOpenWorkOrders,
    maintenance_cost_by_vehicle: analyticsService.getMaintenanceCostByVehicle,

    top_issued_parts: analyticsService.getInventoryTopIssuedParts,
    low_stock_items: analyticsService.getInventoryLowStockItems,

    trips_summary: analyticsService.getTripsSummary,
    active_trips: analyticsService.getActiveTrips,
    trips_need_financial_closure: analyticsService.getTripsNeedingFinancialClosure,
    top_clients_by_trips: analyticsService.getTopClientsByTrips,
    top_sites_by_trips: analyticsService.getTopSitesByTrips,
    top_vehicles_by_trips: analyticsService.getTopVehiclesByTrips,
    trips_profit_summary: analyticsService.getTripsProfitSummary,
    top_profitable_trips: analyticsService.getTopProfitableTrips,
    worst_trips_by_profit: analyticsService.getWorstTrips,
    low_margin_trips: analyticsService.getLowMarginTrips,

    entity_profit_summary: analyticsService.getEntityProfitSummary,
    
  };

  const handler = handlers[intent];
  if (!handler) return null;

  return handler.call(analyticsService, {
    companyId,
    user,
    query,
  });
}

async function handleActionExecution({
  companyId,
  parsed,
  user,
  conversation,
  userMessage,
}) {
  const actionRun = await aiPersistenceService.createActionRun({
    companyId,
    conversationId: conversation?.id || null,
    messageId: userMessage?.id || null,
    userId: getUserId(user),
    actionName: parsed?.intent || "unknown_action",
    payloadJson: parsed?.action_payload || null,
  });

  try {
    const execution = await executeAiAction({
      interpreted: {
        mode: "action",
        domain: parsed?.domain,
        action: parsed?.intent,
        confidence: parsed?.confidence,
        auto_execute: parsed?.auto_execute,
        payload: parsed?.action_payload || {},
      },
      companyId,
      user,
    });

    const built = buildArabicAnswer({
      parsed,
      execution,
      result: execution,
    });

    const followUps = getFollowUpQuestions({
      parsed,
      execution,
      result: execution,
    });

    const response = {
      ok: true,
      parsed,
      intent: parsed,
      mode: "action",
      action: parsed?.intent,
      ui: built.ui,
      execution: {
        status: execution?.executed ? "executed" : "execution_failed",
        ready_to_execute: false,
        executed: Boolean(execution?.executed),
        payload: parsed?.action_payload || null,
        missing_fields: [],
      },
      result: execution,
      answer: built.answer,
      followUps,
      insights: [],
      session_snapshot: null,
      conversation_id: conversation?.id || null,
    };

    await aiPersistenceService.markActionRunSuccess({
      companyId,
      runId: actionRun.id,
      resultJson: execution,
    });

    await aiPersistenceService.createAssistantMessage({
      companyId,
      conversationId: conversation?.id,
      content: buildPersistableAssistantText(response),
      parsed,
      responseJson: response,
    });

    return response;
  } catch (error) {
    await aiPersistenceService.markActionRunFailed({
      companyId,
      runId: actionRun.id,
      errorMessage: error?.message || "Action execution failed",
      resultJson: null,
    });
    throw error;
  }
}

async function handleQueryExecution({
  companyId,
  parsed,
  user,
  question,
  body,
  conversation,
  userMessage,
}) {
  const analyticsQuery = parsedToAnalyticsQuery(parsed);

  const queryRun = await aiPersistenceService.createQueryRun({
    companyId,
    conversationId: conversation?.id || null,
    messageId: userMessage?.id || null,
    userId: getUserId(user),
    question,
    parsedJson: parsed,
    analyticsQuery,
    sessionSnapshot: body?.session_snapshot || null,
  });

  try {
    const result = await executeParsedQuery({
      companyId,
      user,
      parsed,
    });

    if (!result) {
      const entityFollowUpResponse = tryEntityFollowUp({
        parsed,
        question,
        snapshot: body?.session_snapshot || null,
      });

      const finalResponse = entityFollowUpResponse || buildUnknownResponse(parsed);

      await aiPersistenceService.markQueryRunSuccess({
        companyId,
        runId: queryRun.id,
        resultJson: finalResponse?.result || finalResponse || null,
        sessionSnapshot: finalResponse?.session_snapshot || null,
      });

      await aiPersistenceService.createAssistantMessage({
        companyId,
        conversationId: conversation?.id,
        content: buildPersistableAssistantText(finalResponse),
        parsed,
        responseJson: {
          ...finalResponse,
          conversation_id: conversation?.id || null,
        },
      });

      return {
        ...finalResponse,
        conversation_id: conversation?.id || null,
      };
    }

    const built = buildArabicAnswer({
      parsed,
      result,
    });

    const followUps = getFollowUpQuestions({
      parsed,
      result,
    });

    const insights = await buildInlineInsights({
      companyId,
      user,
      parsed,
      result,
    });

    const baseSessionSnapshot = buildSessionSnapshot({
      parsed,
      result,
    });

    const sessionSnapshot = enrichSessionSnapshotWithEntities({
      parsed,
      result,
      snapshot: baseSessionSnapshot,
    });

    const response = {
      ok: true,
      parsed,
      intent: parsed,
      mode: "query",
      ui: built.ui,
      result,
      answer: built.answer,
      followUps,
      insights,
      session_snapshot: sessionSnapshot,
      conversation_id: conversation?.id || null,
    };

    await aiPersistenceService.markQueryRunSuccess({
      companyId,
      runId: queryRun.id,
      resultJson: result,
      sessionSnapshot,
    });

    await aiPersistenceService.createAssistantMessage({
      companyId,
      conversationId: conversation?.id,
      content: buildPersistableAssistantText(response),
      parsed,
      responseJson: response,
    });

    return response;
  } catch (error) {
    await aiPersistenceService.markQueryRunFailed({
      companyId,
      runId: queryRun.id,
      errorMessage: error?.message || "Query execution failed",
      resultJson: null,
    });
    throw error;
  }
}

module.exports = {
  parsedToAnalyticsQuery,
  buildPersistableAssistantText,
  tryEntityFollowUp,
  handleActionExecution,
  handleQueryExecution,
};