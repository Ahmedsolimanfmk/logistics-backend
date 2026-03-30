const analyticsService = require("../analytics/analytics.service");
const aiPersistenceService = require("./ai-persistence.service");
const { parseAiQuestion } = require("./ai-analytics.parser");
const { getSuggestedQuestions } = require("./ai-analytics.suggestions");
const { buildInsightsByContext } = require("./ai-analytics.insights");
const { resolveReferenceFollowUp } = require("./ai-analytics.session");
const {
  buildUnknownResponse,
  buildUnsupportedFollowupResponse,
  buildReferenceFollowUpResponse,
  buildReferenceExpandLimitResponse,
  buildActionPreviewResponse,
} = require("./ai-analytics.responses");
const {
  handleActionExecution,
  handleQueryExecution,
  tryEntityFollowUp,
  buildPersistableAssistantText,
} = require("./ai-analytics.runtime");

function extractConversationMeta({ body }) {
  return {
    conversationId: body?.conversation_id || body?.conversationId || null,
    context: String(body?.context || "").trim() || null,
    title: String(body?.title || "").trim() || null,
  };
}

function getUserId(user) {
  return user?.id || null;
}

function getEffectiveSessionSnapshot({ body, persistedSnapshot }) {
  return body?.session_snapshot || persistedSnapshot || null;
}

async function persistAssistantResponse({
  companyId,
  conversationId,
  parsed,
  response,
}) {
  await aiPersistenceService.createAssistantMessage({
    companyId,
    conversationId,
    content: buildPersistableAssistantText(response),
    parsed: response?.parsed || parsed || null,
    responseJson: {
      ...response,
      conversation_id: conversationId,
    },
  });

  return {
    ...response,
    conversation_id: conversationId,
  };
}

async function queryAiAnalytics({ companyId, user, body }) {
  if (!companyId) {
    const err = new Error("companyId is required");
    err.status = 400;
    throw err;
  }

  const question = String(body?.question || "").trim();
  if (!question) {
    const err = new Error("question is required");
    err.status = 400;
    throw err;
  }

  const userId = getUserId(user);
  if (!userId) {
    const err = new Error("user.id is required");
    err.status = 400;
    throw err;
  }

  const { conversationId, context, title } = extractConversationMeta({ body });

  const conversation = await aiPersistenceService.getOrCreateConversation({
    companyId,
    userId,
    conversationId,
    title: title || question.slice(0, 120),
    context,
  });

  const persistedSnapshot = await aiPersistenceService.getLatestConversationSnapshot({
    companyId,
    conversationId: conversation.id,
  });

  const effectiveSnapshot = getEffectiveSessionSnapshot({
    body,
    persistedSnapshot,
  });

  const parsed = parseAiQuestion({
    question,
    context: body?.context || null,
    user,
    body: {
      ...body,
      conversation_id: conversation.id,
      session_snapshot: effectiveSnapshot,
    },
  });

  const userMessage = await aiPersistenceService.createUserMessage({
    companyId,
    conversationId: conversation.id,
    userId,
    content: question,
    parsed,
  });

  if (parsed?.mode === "unsupported_followup") {
    const response = buildUnsupportedFollowupResponse({
      parsed,
      body: {
        ...body,
        session_snapshot: effectiveSnapshot,
      },
    });

    return persistAssistantResponse({
      companyId,
      conversationId: conversation.id,
      parsed,
      response,
    });
  }

  if (!parsed || parsed.mode === "unknown" || parsed.intent === "unknown") {
    const entityFollowUpResponse = tryEntityFollowUp({
      parsed,
      question,
      snapshot: effectiveSnapshot,
    });

    const response = entityFollowUpResponse || buildUnknownResponse(parsed);

    return persistAssistantResponse({
      companyId,
      conversationId: conversation.id,
      parsed,
      response,
    });
  }

  if (parsed.mode === "reference_followup") {
    if (parsed.intent === "reference_previous_expand_limit") {
      const response = buildReferenceExpandLimitResponse({
        parsed,
        snapshot: effectiveSnapshot,
      });

      return persistAssistantResponse({
        companyId,
        conversationId: conversation.id,
        parsed,
        response,
      });
    }

    // أولوية أولى: entity layer
    // ده بيغطي:
    // - الأول / الثاني من last_entities
    // - هو / هي / هذا / هذه / نفس العميل ...
    // - تحديث primary_entity وentity_context بشكل أفضل
    const entityFollowUpResponse = tryEntityFollowUp({
      parsed,
      question,
      snapshot: effectiveSnapshot,
    });

    if (entityFollowUpResponse) {
      return persistAssistantResponse({
        companyId,
        conversationId: conversation.id,
        parsed: entityFollowUpResponse?.parsed || parsed,
        response: entityFollowUpResponse,
      });
    }

    // fallback backward-compatible للمسار القديم
    const referenceResult = resolveReferenceFollowUp({
      parsed,
      body: {
        ...body,
        session_snapshot: effectiveSnapshot,
      },
    });

    const response = buildReferenceFollowUpResponse({
      parsed,
      referenceResult,
    });

    return persistAssistantResponse({
      companyId,
      conversationId: conversation.id,
      parsed,
      response,
    });
  }

  if (parsed.mode === "action" && !body?.auto_execute) {
    const response = buildActionPreviewResponse({ parsed });

    return persistAssistantResponse({
      companyId,
      conversationId: conversation.id,
      parsed,
      response,
    });
  }

  if (parsed.mode === "action") {
    return handleActionExecution({
      companyId,
      parsed,
      user,
      conversation,
      userMessage,
    });
  }

  return handleQueryExecution({
    companyId,
    parsed,
    user,
    question,
    body: {
      ...body,
      session_snapshot: effectiveSnapshot,
    },
    conversation,
    userMessage,
  });
}

async function getAiSuggestedQuestions({ companyId, user, query }) {
  const context = String(query?.context || "").trim().toLowerCase() || null;

  const questions = getSuggestedQuestions({
    companyId,
    user,
    context,
  });

  return {
    ok: true,
    context,
    questions,
  };
}

async function getAiInsights({ companyId, user, query }) {
  if (!companyId) {
    const err = new Error("companyId is required");
    err.status = 400;
    throw err;
  }

  const context = String(query?.context || "").trim().toLowerCase() || null;
  const data = {};

  if (!context || context === "finance") {
    data.expenseSummary = await analyticsService.getFinanceExpenseSummary({
      companyId,
      user,
      query: { range: "this_month" },
    });

    data.expenseByType = await analyticsService.getFinanceExpenseByType({
      companyId,
      user,
      query: { range: "this_month", limit: 5 },
    });

    data.expenseByVehicle = await analyticsService.getFinanceExpenseByVehicle({
      companyId,
      user,
      query: { range: "this_month", limit: 5 },
    });

    data.expenseByPaymentSource =
      await analyticsService.getFinanceExpenseByPaymentSource({
        companyId,
        user,
        query: { range: "this_month" },
      });

    data.topVendors = await analyticsService.getFinanceTopVendors({
      companyId,
      user,
      query: { range: "this_month", limit: 5 },
    });

    data.expenseApprovalBreakdown =
      await analyticsService.getFinanceExpenseApprovalBreakdown({
        companyId,
        user,
        query: { range: "this_month" },
      });

    data.expenseSummaryLastMonth = await analyticsService.getFinanceExpenseSummary({
      companyId,
      user,
      query: { range: "last_month" },
    });
  }

  if (!context || context === "ar") {
    data.outstandingSummary = await analyticsService.getArOutstandingSummary({
      companyId,
      user,
      query: { range: "this_month" },
    });

    data.topDebtors = await analyticsService.getArTopDebtors({
      companyId,
      user,
      query: { range: "this_month", limit: 5 },
    });
  }

  if (!context || context === "maintenance") {
    data.openWorkOrders = await analyticsService.getMaintenanceOpenWorkOrders({
      companyId,
      user,
      query: { range: "this_month" },
    });

    data.costByVehicle = await analyticsService.getMaintenanceCostByVehicle({
      companyId,
      user,
      query: { range: "this_month", limit: 5 },
    });
  }

  if (!context || context === "inventory") {
    data.topIssuedParts = await analyticsService.getInventoryTopIssuedParts({
      companyId,
      user,
      query: { range: "this_month", limit: 5 },
    });

    data.lowStockItems = await analyticsService.getInventoryLowStockItems({
      companyId,
      user,
      query: { limit: 10 },
    });
  }

  if (!context || context === "trips") {
    data.tripsSummary = await analyticsService.getTripsSummary({
      companyId,
      user,
      query: { range: "this_month" },
    });

    data.activeTrips = await analyticsService.getActiveTrips({
      companyId,
      user,
      query: { range: "this_month", limit: 5 },
    });

    data.tripsNeedFinancialClosure =
      await analyticsService.getTripsNeedingFinancialClosure({
        companyId,
        user,
        query: { range: "this_month", limit: 5 },
      });

    data.topClientsByTrips = await analyticsService.getTopClientsByTrips({
      companyId,
      user,
      query: { range: "this_month", limit: 5 },
    });

    data.topSitesByTrips = await analyticsService.getTopSitesByTrips({
      companyId,
      user,
      query: { range: "this_month", limit: 5 },
    });

    data.topVehiclesByTrips = await analyticsService.getTopVehiclesByTrips({
      companyId,
      user,
      query: { range: "this_month", limit: 5 },
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