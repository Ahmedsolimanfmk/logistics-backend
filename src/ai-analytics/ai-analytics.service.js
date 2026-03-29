const analyticsService = require("../analytics/analytics.service");
const aiPersistenceService = require("./ai-persistence.service");
const { parseAiQuestion } = require("./ai-analytics.parser");
const { buildArabicAnswer } = require("./ai-analytics.answer");
const { getSuggestedQuestions } = require("./ai-analytics.suggestions");
const { buildInsightsByContext } = require("./ai-analytics.insights");
const { getFollowUpQuestions } = require("./ai-analytics.followups");
const { executeAiAction } = require("./ai-analytics.actions");
const {
  buildSessionSnapshot,
  resolveReferenceFollowUp,
} = require("./ai-analytics.session");
const {
  handleEntityIntelligenceFollowUp,
  enrichSessionSnapshotWithEntities,
} = require("./entity/entity-intelligence");

// =======================
// Small helpers
// =======================
function buildSimpleResponse({
  parsed,
  mode = "unknown",
  title,
  summary,
  badges = [],
  result = null,
  answer,
  followUps = [],
  insights = [],
  session_snapshot = null,
  result_type = "summary",
  has_items = false,
  extra = {},
}) {
  return {
    ok: true,
    parsed,
    intent: parsed,
    mode,
    ui: {
      mode,
      title,
      summary,
      badges,
      result_type,
      has_items,
    },
    result,
    answer,
    followUps,
    insights,
    session_snapshot,
    ...extra,
  };
}

function buildDefaultFollowUps() {
  return [
    "كم إجمالي المصروفات هذا الشهر؟",
    "من أعلى عميل مديونية؟",
    "كم عدد أوامر العمل المفتوحة؟",
    "ما الأصناف القريبة من النفاد؟",
    "كم عدد الرحلات هذا الشهر؟",
  ];
}

function buildReferenceFallbackFollowUps() {
  return [
    "اعرض أعلى 5 عملاء مديونية",
    "اعرض أعلى 5 مركبات تكلفة صيانة",
    "اعرض أعلى 5 أصناف صرفًا",
    "اعرض أعلى 5 مركبات حسب الرحلات",
  ];
}

function buildEntityUnsupportedFollowUps(reason) {
  if (reason === "profit_followup_pending") {
    return ["رحلاته", "مصروفاته", "مديونيته"];
  }

  if (reason === "maintenance_requires_vehicle") {
    return ["اعرض أعلى 5 مركبات تكلفة صيانة", "اعرض أعلى 5 مركبات حسب الرحلات"];
  }

  if (reason === "receivables_requires_client") {
    return ["اعرض أعلى 5 عملاء مديونية"];
  }

  if (reason === "trips_requires_client_vehicle_site") {
    return [
      "اعرض أعلى 5 عملاء حسب الرحلات",
      "اعرض أعلى 5 مركبات حسب الرحلات",
      "اعرض أعلى 5 مواقع حسب الرحلات",
    ];
  }

  if (reason === "profit_requires_client") {
    return ["اعرض أعلى 5 عملاء حسب الرحلات", "اعرض أعلى 5 عملاء مديونية"];
  }

  if (reason === "expenses_requires_supported_owner") {
    return [
      "اعرض أعلى 5 عملاء مديونية",
      "اعرض أعلى 5 مركبات صرفًا",
      "اعرض أعلى 5 مواقع حسب الرحلات",
    ];
  }

  return ["اعرض أعلى 5 عملاء مديونية", "اعرض أعلى 5 مركبات حسب الرحلات"];
}

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

function extractConversationMeta({ body }) {
  return {
    conversationId:
      body?.conversation_id || body?.conversationId || null,
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

// =======================
// Compare helper
// =======================
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

// =======================
// Response builders
// =======================
function buildUnknownResponse(parsed) {
  const answer =
    "السؤال غير مدعوم حاليًا في النسخة الحالية من المساعد الذكي. استخدم أحد الأسئلة المدعومة الظاهرة داخل القسم.";

  return buildSimpleResponse({
    parsed,
    mode: "unknown",
    title: "سؤال غير مدعوم حاليًا",
    summary: answer,
    badges: ["غير مدعوم"],
    answer,
    followUps: buildDefaultFollowUps(),
  });
}

function buildUnsupportedFollowupResponse({ parsed, body }) {
  let title = "الطلب مفهوم لكن غير مكتمل التنفيذ حاليًا";
  let summary =
    "تم فهم المقصود من السؤال، لكن هذا النوع من المتابعة غير مدعوم بالكامل في النسخة الحالية.";
  let answer = summary;

  if (parsed?.intent === "profit_followup_pending") {
    title = "تحليل الربحية غير متاح بعد";
    summary =
      "تم فهم طلب الربحية، لكن حساب الربح يحتاج intent تحليلي مخصص لم يتم إضافته بعد.";
    answer =
      "فهمت أنك تريد الربحية، لكن حساب الربح لم يُفعَّل بعد داخل محرك التحليلات. يمكننا إضافته في المرحلة التالية.";
  } else if (parsed?.unsupported_reason === "maintenance_requires_vehicle") {
    title = "الصيانة ترتبط بالمركبات";
    summary = "لا يمكن عرض الصيانة إلا إذا كان المرجع الحالي مركبة.";
    answer = "الصيانة ترتبط بالمركبات، وليس بالعميل أو الموقع الحالي.";
  } else if (parsed?.unsupported_reason === "receivables_requires_client") {
    title = "المديونية ترتبط بالعملاء";
    summary = "لا يمكن عرض المديونية إلا إذا كان المرجع الحالي عميلًا.";
    answer = "المديونية ترتبط بالعملاء، وليس بالمركبة أو الموقع الحالي.";
  } else if (parsed?.unsupported_reason === "trips_requires_client_vehicle_site") {
    title = "الرحلات تحتاج مرجعًا صالحًا";
    summary = "الرحلات يمكن ربطها بعميل أو مركبة أو موقع.";
    answer =
      "أحتاج أن يكون المرجع الحالي عميلًا أو مركبة أو موقعًا حتى أعرض الرحلات المرتبطة به.";
  } else if (parsed?.unsupported_reason === "profit_requires_client") {
    title = "الربحية الحالية متاحة للعملاء فقط";
    summary = "لا يمكن حساب الربحية حاليًا إلا إذا كان المرجع الحالي عميلًا.";
    answer = "حساب الربحية متاح حاليًا للعملاء فقط، وليس للمركبة أو الموقع أو الرحلة.";
  } else if (parsed?.unsupported_reason === "expenses_requires_supported_owner") {
    title = "لا يمكن تحديد المصروفات لهذا المرجع";
    summary = "المصروفات الحالية يمكن ربطها بعميل أو موقع أو مركبة فقط.";
    answer =
      "أحتاج أن يكون المرجع الحالي عميلًا أو موقعًا أو مركبة حتى أعرض المصروفات المرتبطة به.";
  }

  return buildSimpleResponse({
    parsed,
    mode: "unsupported_followup",
    title,
    summary,
    badges: ["Entity Intelligence", "قيد التطوير"],
    answer,
    followUps: buildEntityUnsupportedFollowUps(
      parsed?.unsupported_reason || parsed?.intent
    ),
    session_snapshot: body?.session_snapshot || null,
  });
}

function buildReferenceFollowUpResponse({ parsed, referenceResult }) {
  const item = referenceResult?.resolved_item || null;
  const entity = referenceResult?.resolved_entity || null;

  if (!item) {
    return buildSimpleResponse({
      parsed,
      mode: "unknown",
      title: "تعذر تحديد المرجع السابق",
      summary: "لم أتمكن من تحديد العنصر المقصود من النتائج السابقة.",
      badges: ["متابعة"],
      answer: "لم أتمكن من تحديد العنصر المقصود من النتائج السابقة.",
      followUps: buildReferenceFallbackFollowUps(),
    });
  }

  const snapshot = buildSessionSnapshot({
    parsed,
    result: {
      data: {
        items: [item],
      },
    },
  });

  if (entity?.client_hint) {
    snapshot.applied_entities.client_hint = entity.client_hint;
  }
  if (entity?.site_hint) {
    snapshot.applied_entities.site_hint = entity.site_hint;
  }
  if (entity?.vehicle_hint) {
    snapshot.applied_entities.vehicle_hint = entity.vehicle_hint;
  }

  const result = {
    data: {
      items: [item],
    },
  };

  return buildSimpleResponse({
    parsed,
    mode: "query",
    title: "العنصر المشار إليه من النتيجة السابقة",
    summary: entity?.entity_label
      ? `تم تحديد "${entity.entity_label}" من النتائج السابقة.`
      : "تم تحديد العنصر المقصود من النتائج السابقة.",
    badges: ["متابعة", "مرجع سابق"],
    result,
    answer: entity?.entity_label
      ? `تم تحديد "${entity.entity_label}" من النتائج السابقة.`
      : "هذا هو العنصر المقصود من النتائج السابقة.",
    followUps: getFollowUpQuestions({
      parsed,
      result,
    }),
    session_snapshot: snapshot,
    result_type: "table",
    has_items: true,
  });
}

function buildReferenceExpandLimitResponse({ parsed, snapshot }) {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const limit = Number(parsed?.options?.limit || 10);
  const sliced = items.slice(0, limit);

  if (!items.length) {
    return buildSimpleResponse({
      parsed,
      mode: "unknown",
      title: "لا توجد نتائج سابقة للتوسيع",
      summary: "لم أجد نتائج سابقة يمكن توسيعها.",
      badges: ["متابعة"],
      answer: "لم أجد نتائج سابقة يمكن توسيعها.",
      followUps: buildReferenceFallbackFollowUps(),
    });
  }

  const newSnapshot = {
    ...snapshot,
    items: sliced,
    first_item: sliced[0] || null,
    count: sliced.length,
    created_at: new Date().toISOString(),
  };

  return buildSimpleResponse({
    parsed,
    mode: "query",
    title: `توسيع النتائج السابقة إلى ${limit}`,
    summary: `تم عرض أول ${sliced.length} عنصر من النتائج السابقة.`,
    badges: ["متابعة", "توسيع النتائج"],
    result: {
      data: {
        items: sliced,
      },
    },
    answer: `تم عرض أول ${sliced.length} عنصر من النتائج السابقة.`,
    followUps: getFollowUpQuestions({
      parsed,
      result: {
        data: {
          items: sliced,
        },
      },
    }),
    session_snapshot: newSnapshot,
    result_type: "table",
    has_items: true,
  });
}

function buildActionPreviewResponse({ parsed }) {
  let message = "الأمر جاهز للتنفيذ.";

  if (parsed?.intent === "create_work_order") {
    message = "تم فهم أمر إنشاء أمر عمل وهو جاهز للتنفيذ. اضغط تنفيذ الآن.";
  } else if (parsed?.intent === "create_maintenance_request") {
    message = "تم فهم طلب إنشاء طلب صيانة وهو جاهز للتنفيذ. اضغط تنفيذ الآن.";
  } else if (parsed?.intent === "create_expense") {
    message = "تم فهم أمر تسجيل المصروف وهو جاهز للتنفيذ. اضغط تنفيذ الآن.";
  }

  return {
    ok: true,
    parsed,
    intent: parsed,
    mode: "action",
    action: parsed.intent,
    ui: {
      mode: "action",
      title: "معاينة الأمر قبل التنفيذ",
      summary: message,
      badges: ["أمر تنفيذي", "جاهز للتنفيذ"],
      result_type: "summary",
      has_items: false,
    },
    execution: {
      status: "ready_to_execute",
      ready_to_execute: true,
      executed: false,
      payload: parsed.action_payload || null,
      missing_fields: [],
    },
    result: null,
    answer: message,
    followUps: ["نفذ الآن"],
    insights: [],
    session_snapshot: null,
  };
}

// =======================
// Query execution
// =======================
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

    entity_profit_summary: analyticsService.getEntityProfitSummary,
  };

  const handler = handlers[intent];
  if (!handler) return null;

  return handler.call(analyticsService, { companyId, user, query });
}

// =======================
// Inline insights
// =======================
async function buildFinanceInlineInsights({ companyId, user, parsed, result }) {
  const expenseSummary =
    parsed?.intent === "expense_summary"
      ? result
      : await analyticsService.getFinanceExpenseSummary({
          companyId,
          user,
          query: { range: "this_month" },
        });

  const expenseByType =
    parsed?.intent === "expense_by_type"
      ? result
      : await analyticsService.getFinanceExpenseByType({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const expenseByVehicle =
    parsed?.intent === "expense_by_vehicle"
      ? result
      : await analyticsService.getFinanceExpenseByVehicle({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const expenseByPaymentSource =
    parsed?.intent === "expense_by_payment_source"
      ? result
      : await analyticsService.getFinanceExpenseByPaymentSource({
          companyId,
          user,
          query: { range: "this_month" },
        });

  const topVendors =
    parsed?.intent === "top_vendors"
      ? result
      : await analyticsService.getFinanceTopVendors({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const expenseApprovalBreakdown =
    parsed?.intent === "expense_approval_breakdown"
      ? result
      : await analyticsService.getFinanceExpenseApprovalBreakdown({
          companyId,
          user,
          query: { range: "this_month" },
        });

  const expenseSummaryLastMonth = await analyticsService.getFinanceExpenseSummary({
    companyId,
    user,
    query: { range: "last_month" },
  });

  return buildInsightsByContext({
    context: "finance",
    data: {
      expenseSummary,
      expenseByType,
      expenseByVehicle,
      expenseByPaymentSource,
      topVendors,
      expenseApprovalBreakdown,
      expenseSummaryLastMonth,
    },
  }).slice(0, 5);
}

async function buildArInlineInsights({ companyId, user, parsed, result }) {
  const outstandingSummary =
    parsed?.intent === "outstanding_summary"
      ? result
      : await analyticsService.getArOutstandingSummary({
          companyId,
          user,
          query: { range: "this_month" },
        });

  const topDebtors =
    parsed?.intent === "top_debtors"
      ? result
      : await analyticsService.getArTopDebtors({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  return buildInsightsByContext({
    context: "ar",
    data: {
      outstandingSummary,
      topDebtors,
    },
  }).slice(0, 3);
}

async function buildMaintenanceInlineInsights({ companyId, user, parsed, result }) {
  const openWorkOrders =
    parsed?.intent === "open_work_orders"
      ? result
      : await analyticsService.getMaintenanceOpenWorkOrders({
          companyId,
          user,
          query: { range: "this_month" },
        });

  const costByVehicle =
    parsed?.intent === "maintenance_cost_by_vehicle"
      ? result
      : await analyticsService.getMaintenanceCostByVehicle({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  return buildInsightsByContext({
    context: "maintenance",
    data: {
      openWorkOrders,
      costByVehicle,
    },
  }).slice(0, 3);
}

async function buildInventoryInlineInsights({ companyId, user, parsed, result }) {
  const topIssuedParts =
    parsed?.intent === "top_issued_parts"
      ? result
      : await analyticsService.getInventoryTopIssuedParts({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const lowStockItems =
    parsed?.intent === "low_stock_items"
      ? result
      : await analyticsService.getInventoryLowStockItems({
          companyId,
          user,
          query: { limit: 10 },
        });

  return buildInsightsByContext({
    context: "inventory",
    data: {
      topIssuedParts,
      lowStockItems,
    },
  }).slice(0, 3);
}

async function buildTripsInlineInsights({ companyId, user, parsed, result }) {
  const tripsSummary =
    parsed?.intent === "trips_summary"
      ? result
      : await analyticsService.getTripsSummary({
          companyId,
          user,
          query: { range: "this_month" },
        });

  const activeTrips =
    parsed?.intent === "active_trips"
      ? result
      : await analyticsService.getActiveTrips({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const tripsNeedFinancialClosure =
    parsed?.intent === "trips_need_financial_closure"
      ? result
      : await analyticsService.getTripsNeedingFinancialClosure({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const topClientsByTrips =
    parsed?.intent === "top_clients_by_trips"
      ? result
      : await analyticsService.getTopClientsByTrips({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const topSitesByTrips =
    parsed?.intent === "top_sites_by_trips"
      ? result
      : await analyticsService.getTopSitesByTrips({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const topVehiclesByTrips =
    parsed?.intent === "top_vehicles_by_trips"
      ? result
      : await analyticsService.getTopVehiclesByTrips({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  return buildInsightsByContext({
    context: "trips",
    data: {
      tripsSummary,
      activeTrips,
      tripsNeedFinancialClosure,
      topClientsByTrips,
      topSitesByTrips,
      topVehiclesByTrips,
    },
  }).slice(0, 5);
}

async function buildInlineInsights({ companyId, user, parsed, result }) {
  const moduleName = parsed?.module || parsed?.domain;

  if (moduleName === "finance") {
    return buildFinanceInlineInsights({ companyId, user, parsed, result });
  }

  if (moduleName === "ar") {
    return buildArInlineInsights({ companyId, user, parsed, result });
  }

  if (moduleName === "maintenance") {
    return buildMaintenanceInlineInsights({ companyId, user, parsed, result });
  }

  if (moduleName === "inventory") {
    return buildInventoryInlineInsights({ companyId, user, parsed, result });
  }

  if (moduleName === "trips") {
    return buildTripsInlineInsights({ companyId, user, parsed, result });
  }

  return [];
}

// =======================
// Main flow helpers
// =======================
function tryEntityFollowUp({ parsed, question, snapshot }) {
  return handleEntityIntelligenceFollowUp({
    parsed: parsed || { mode: "unknown", intent: "unknown" },
    question,
    snapshot,
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
        domain: parsed.domain,
        action: parsed.intent,
        confidence: parsed.confidence,
        auto_execute: parsed.auto_execute,
        payload: parsed.action_payload || {},
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
      action: parsed.intent,
      ui: built.ui,
      execution: {
        status: execution?.executed ? "executed" : "execution_failed",
        ready_to_execute: false,
        executed: Boolean(execution?.executed),
        payload: parsed.action_payload || null,
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
    const result = await executeParsedQuery({ companyId, user, parsed });

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
        responseJson: finalResponse,
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

// =======================
// Public API
// =======================
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

    await aiPersistenceService.createAssistantMessage({
      companyId,
      conversationId: conversation.id,
      content: buildPersistableAssistantText(response),
      parsed,
      responseJson: {
        ...response,
        conversation_id: conversation.id,
      },
    });

    return {
      ...response,
      conversation_id: conversation.id,
    };
  }

  if (!parsed || parsed.mode === "unknown" || parsed.intent === "unknown") {
    const entityFollowUpResponse = tryEntityFollowUp({
      parsed,
      question,
      snapshot: effectiveSnapshot,
    });

    const response = entityFollowUpResponse || buildUnknownResponse(parsed);

    await aiPersistenceService.createAssistantMessage({
      companyId,
      conversationId: conversation.id,
      content: buildPersistableAssistantText(response),
      parsed,
      responseJson: {
        ...response,
        conversation_id: conversation.id,
      },
    });

    return {
      ...response,
      conversation_id: conversation.id,
    };
  }

  if (parsed.mode === "reference_followup") {
    if (parsed.intent === "reference_previous_expand_limit") {
      const response = buildReferenceExpandLimitResponse({
        parsed,
        snapshot: effectiveSnapshot,
      });

      await aiPersistenceService.createAssistantMessage({
        companyId,
        conversationId: conversation.id,
        content: buildPersistableAssistantText(response),
        parsed,
        responseJson: {
          ...response,
          conversation_id: conversation.id,
        },
      });

      return {
        ...response,
        conversation_id: conversation.id,
      };
    }

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

    await aiPersistenceService.createAssistantMessage({
      companyId,
      conversationId: conversation.id,
      content: buildPersistableAssistantText(response),
      parsed,
      responseJson: {
        ...response,
        conversation_id: conversation.id,
      },
    });

    return {
      ...response,
      conversation_id: conversation.id,
    };
  }

  if (parsed.mode === "action" && !body?.auto_execute) {
    const response = buildActionPreviewResponse({ parsed });

    await aiPersistenceService.createAssistantMessage({
      companyId,
      conversationId: conversation.id,
      content: buildPersistableAssistantText(response),
      parsed,
      responseJson: {
        ...response,
        conversation_id: conversation.id,
      },
    });

    return {
      ...response,
      conversation_id: conversation.id,
    };
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
      query: {
        range: "this_month",
        limit: 5,
      },
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
      query: {
        range: "this_month",
        limit: 5,
      },
    });
  }

  if (!context || context === "inventory") {
    data.topIssuedParts = await analyticsService.getInventoryTopIssuedParts({
      companyId,
      user,
      query: {
        range: "this_month",
        limit: 5,
      },
    });

    data.lowStockItems = await analyticsService.getInventoryLowStockItems({
      companyId,
      user,
      query: {
        limit: 10,
      },
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
      query: {
        range: "this_month",
        limit: 5,
      },
    });

    data.topSitesByTrips = await analyticsService.getTopSitesByTrips({
      companyId,
      user,
      query: {
        range: "this_month",
        limit: 5,
      },
    });

    data.topVehiclesByTrips = await analyticsService.getTopVehiclesByTrips({
      companyId,
      user,
      query: {
        range: "this_month",
        limit: 5,
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