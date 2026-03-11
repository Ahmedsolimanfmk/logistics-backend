const { SYNONYMS } = require("./ai-analytics.synonyms");
const {
  normalizeArabicText,
  includesAny,
} = require("./ai-analytics.normalize");

const { resolveTimeFilters } = require("./ai-analytics.time-parser");
const {
  extractVehicleHint,
  extractTripHint,
  extractWorkOrderHint,
  extractAmount,
  extractExpenseType,
  extractTitle,
  extractVendorName,
  extractPaidMethod,
} = require("./ai-analytics.actions");

function roleUpper(role) {
  return String(role || "").trim().toUpperCase();
}

function allowedModulesByRole(role) {
  const r = roleUpper(role);

  if (r === "ADMIN") return ["finance", "ar", "maintenance", "inventory"];
  if (r === "ACCOUNTANT") return ["finance", "ar"];
  if (r === "STOREKEEPER") return ["inventory"];
  if (r === "FIELD_SUPERVISOR") return ["finance", "maintenance"];
  if (r === "HR") return ["maintenance"];

  return ["maintenance", "inventory"];
}

function detectLimit(question) {
  const text = normalizeArabicText(question);
  const m = text.match(/\b(\d+)\b/);

  if (!m) return undefined;

  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;

  return Math.max(1, Math.min(50, n));
}

function detectQuestionType(question) {
  const text = normalizeArabicText(question);

  if (includesAny(text, ["اعلي", "اعلى", "اكبر", "اكثر", "top"])) return "top";
  if (includesAny(text, ["كم", "كام", "عدد", "اجمالي", "إجمالي"])) return "summary";

  return "general";
}

function detectModule(question, context, user) {
  const normalizedContext = String(context || "").trim().toLowerCase();
  const allowed = allowedModulesByRole(user?.role);

  if (normalizedContext && allowed.includes(normalizedContext)) {
    return normalizedContext;
  }

  const text = normalizeArabicText(question);
  const scores = {
    finance: 0,
    ar: 0,
    maintenance: 0,
    inventory: 0,
  };

  for (const mod of Object.keys(SYNONYMS.modules || {})) {
    for (const term of SYNONYMS.modules[mod] || []) {
      if (text.includes(normalizeArabicText(term))) {
        scores[mod] += 1;
      }
    }
  }

  const ranked = Object.entries(scores)
    .filter(([mod]) => allowed.includes(mod))
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length && ranked[0][1] > 0) {
    return ranked[0][0];
  }

  return allowed[0] || null;
}

function buildBaseParsed({ question, context, user, body }) {
  const moduleName = detectModule(question, context, user);
  const timeFilters = resolveTimeFilters(question);
  const limit = detectLimit(question);
  const qType = detectQuestionType(question);

  return {
    mode: "unknown",
    module: moduleName || "unknown",
    domain: moduleName || "unknown",
    intent: "unknown",
    confidence: 0,
    raw_question: String(question || "").trim(),
    normalized_question: normalizeArabicText(question),
    entities: {
      vehicle_hint: extractVehicleHint(question) || null,
      trip_hint: extractTripHint(question) || null,
      work_order_hint: extractWorkOrderHint(question) || null,
      client_hint: null,
      part_hint: null,
      expense_type: extractExpenseType(question) || null,
      vendor_name: extractVendorName(question) || null,
      paid_method: extractPaidMethod(question) || null,
      ordinal_ref: null,
      same_as_previous: false,
    },
    metric: null,
    group_by: null,
    filters: {
      range: timeFilters.range,
      date_from: timeFilters.date_from,
      date_to: timeFilters.date_to,
      status: null,
      focus: null,
    },
    options: {
      limit: limit || undefined,
      question_type: qType,
      response_type: "summary",
    },
    action_payload: null,
    auto_execute: Boolean(body?.auto_execute),
  };
}

function detectAction(question, body = {}, base) {
  const text = normalizeArabicText(question);

  if (includesAny(text, SYNONYMS.actions?.createWorkOrder || [])) {
    return {
      ...base,
      mode: "action",
      intent: "create_work_order",
      confidence: 0.95,
      options: {
        ...base.options,
        response_type: "action",
      },
      action_payload: {
        vehicle_hint: extractVehicleHint(question),
        title: extractTitle(question),
        notes: String(question || "").trim(),
      },
    };
  }

  if (includesAny(text, SYNONYMS.actions?.createMaintenanceRequest || [])) {
    return {
      ...base,
      mode: "action",
      intent: "create_maintenance_request",
      confidence: 0.95,
      options: {
        ...base.options,
        response_type: "action",
      },
      action_payload: {
        vehicle_hint: extractVehicleHint(question),
        description: extractTitle(question) || String(question || "").trim(),
        title: extractTitle(question),
      },
    };
  }

  if (
    includesAny(text, SYNONYMS.actions?.createExpense || []) ||
    (text.includes("مصروف") &&
      includesAny(text, ["وقود", "صيانه", "صيانة", "زيت", "كاوتش", "شراء", "نثريه", "نثرية"]))
  ) {
    return {
      ...base,
      mode: "action",
      module: "finance",
      domain: "finance",
      intent: "create_expense",
      confidence: 0.94,
      options: {
        ...base.options,
        response_type: "action",
      },
      action_payload: {
        amount: extractAmount(question),
        expense_type: extractExpenseType(question),
        vehicle_hint: extractVehicleHint(question),
        trip_hint: extractTripHint(question),
        work_order_hint: extractWorkOrderHint(question),
        vendor_name: extractVendorName(question),
        paid_method: extractPaidMethod(question),
        payment_source: body?.payment_source || null,
        cash_advance_id: body?.cash_advance_id || null,
        trip_id: body?.trip_id || null,
        maintenance_work_order_id: body?.maintenance_work_order_id || null,
        receipt_url: body?.receipt_url || null,
        invoice_no: body?.invoice_no || null,
        invoice_date: body?.invoice_date || null,
        vat_amount: body?.vat_amount || null,
        invoice_total: body?.invoice_total || null,
        notes: String(question || "").trim(),
      },
    };
  }

  return null;
}

function parseFinance(question, base) {
  const text = base.normalized_question;
  const limit = base.options.limit;
  const qType = base.options.question_type;

  if (
    (
      includesAny(text, SYNONYMS.finance?.expense || []) &&
      includesAny(text, SYNONYMS.finance?.compare || []) &&
      includesAny(text, SYNONYMS.time?.thisMonth || []) &&
      includesAny(text, SYNONYMS.time?.lastMonth || [])
    ) ||
    includesAny(text, [
      "قارن مصروفات هذا الشهر بالشهر الماضي",
      "مقارنه مصروفات هذا الشهر بالشهر الماضي",
      "فرق المصروفات بين هذا الشهر والشهر الماضي",
      "قارن الصرف هذا الشهر بالشهر الماضي",
    ])
  ) {
    return {
      ...base,
      mode: "query",
      intent: "expense_summary_compare",
      confidence: 0.95,
      metric: "total_expense",
      group_by: null,
      filters: {
        ...base.filters,
        range: "compare_this_vs_last_month",
        date_from: null,
        date_to: null,
      },
      options: {
        ...base.options,
        response_type: "summary",
      },
    };
  }

  if (
    includesAny(text, [
      "اجمالي المصروفات",
      "كم المصروفات",
      "كام المصروفات",
      "صرفنا كام",
      "الصرف كام",
      "مصروفاتنا كام",
      "تكلفه هذا الشهر",
      "تكلفة هذا الشهر",
      "مصروفات هذا الشهر",
      "اجمالي الصرف",
    ]) ||
    (text.includes("مصروفات") && includesAny(text, ["اجمالي", "كم", "كام"])) ||
    (text.includes("الصرف") && includesAny(text, ["اجمالي", "كم", "كام"]))
  ) {
    return {
      ...base,
      mode: "query",
      intent: "expense_summary",
      confidence: 0.92,
      metric: "total_expense",
      group_by: null,
      options: {
        ...base.options,
        response_type: "summary",
      },
    };
  }

  if (
    includesAny(text, SYNONYMS.finance?.byType || []) ||
    (text.includes("مصروفات") && includesAny(text, ["النوع", "بند"])) ||
    (text.includes("مصروف") && includesAny(text, ["نوع", "بند", "اعلى", "اكثر", "اكبر"]))
  ) {
    const finalLimit = limit || (qType === "top" ? 5 : 1);

    return {
      ...base,
      mode: "query",
      intent: "expense_by_type",
      confidence: 0.92,
      metric: "expense_amount",
      group_by: "expense_type",
      options: {
        ...base.options,
        limit: finalLimit,
        response_type: finalLimit > 1 ? "table" : "summary",
      },
    };
  }

  return null;
}

function parseAr(question, base) {
  const text = base.normalized_question;
  const limit = base.options.limit;
  const qType = base.options.question_type;

  if (
    includesAny(text, SYNONYMS.ar?.outstanding || []) ||
    (text.includes("مستحقات") && includesAny(text, ["العملاء", "عملاء"])) ||
    (text.includes("مديوني") && includesAny(text, ["العملاء", "عملاء"]))
  ) {
    return {
      ...base,
      mode: "query",
      intent: "outstanding_summary",
      confidence: 0.9,
      metric: "total_outstanding",
      group_by: null,
      filters: {
        ...base.filters,
        focus: "summary",
      },
      options: {
        ...base.options,
        response_type: "summary",
      },
    };
  }

  if (
    includesAny(text, SYNONYMS.ar?.overdue || []) ||
    (text.includes("متاخر") && includesAny(text, ["العملاء", "عملاء", "مستحقات"]))
  ) {
    return {
      ...base,
      mode: "query",
      intent: "outstanding_summary",
      confidence: 0.9,
      metric: "overdue_amount",
      group_by: null,
      filters: {
        ...base.filters,
        focus: "overdue_only",
      },
      options: {
        ...base.options,
        response_type: "summary",
      },
    };
  }

  if (
    includesAny(text, SYNONYMS.ar?.topDebtors || []) ||
    (
      includesAny(text, ["عميل", "العملاء", "عملاء"]) &&
      includesAny(text, ["مديونيه", "مديونية", "المديونيات", "مستحقات"]) &&
      includesAny(text, ["اعلى", "اعلي", "اكثر", "اكبر", "top", "مين", "من"])
    )
  ) {
    const finalLimit = limit || (qType === "top" ? 5 : 1);

    return {
      ...base,
      mode: "query",
      intent: "top_debtors",
      confidence: 0.9,
      metric: "outstanding_amount",
      group_by: "client",
      options: {
        ...base.options,
        limit: finalLimit,
        response_type: finalLimit > 1 ? "table" : "summary",
      },
    };
  }

  return null;
}

function parseMaintenance(question, base) {
  const text = base.normalized_question;
  const limit = base.options.limit;
  const qType = base.options.question_type;

  if (
    includesAny(text, SYNONYMS.maintenance?.openWorkOrders || []) ||
    (
      (text.includes("امر") || text.includes("اوامر")) &&
      includesAny(text, ["عمل", "صيانه", "صيانة"]) &&
      includesAny(text, ["مفتوح", "مفتوحه", "مفتوحة"])
    )
  ) {
    return {
      ...base,
      mode: "query",
      intent: "open_work_orders",
      confidence: 0.9,
      metric: "open_work_orders_count",
      group_by: null,
      options: {
        ...base.options,
        response_type: "summary",
      },
    };
  }

  if (
    includesAny(text, SYNONYMS.maintenance?.costByVehicle || []) ||
    (
      includesAny(text, ["تكلفه", "تكلفة", "صيانه", "صيانة"]) &&
      includesAny(text, ["مركبه", "مركبات", "عربيه", "عربيات", "سياره", "سيارات"]) &&
      includesAny(text, ["اعلى", "اعلي", "اكثر", "اكبر", "top", "مين", "ايه", "انهي"])
    )
  ) {
    const finalLimit = limit || (qType === "top" ? 5 : 1);

    return {
      ...base,
      mode: "query",
      intent: "maintenance_cost_by_vehicle",
      confidence: 0.9,
      metric: "maintenance_cost",
      group_by: "vehicle",
      options: {
        ...base.options,
        limit: finalLimit,
        response_type: finalLimit > 1 ? "table" : "summary",
      },
    };
  }

  return null;
}

function parseInventory(question, base) {
  const text = base.normalized_question;
  const limit = base.options.limit;
  const qType = base.options.question_type;

  if (
    includesAny(text, SYNONYMS.inventory?.topIssuedParts || []) ||
    (
      includesAny(text, ["قطع", "قطع الغيار", "اصناف", "الصنف"]) &&
      includesAny(text, ["صرف", "الصرف", "بتتصرف", "المصروف"]) &&
      includesAny(text, ["اكثر", "اعلى", "اعلي", "اكبر", "top", "مين", "ايه"])
    )
  ) {
    const finalLimit = limit || (qType === "top" ? 5 : 1);

    return {
      ...base,
      mode: "query",
      intent: "top_issued_parts",
      confidence: 0.9,
      metric: "issued_qty",
      group_by: "part",
      options: {
        ...base.options,
        limit: finalLimit,
        response_type: finalLimit > 1 ? "table" : "summary",
      },
    };
  }

  if (
    includesAny(text, SYNONYMS.inventory?.lowStock || []) ||
    (
      includesAny(text, ["نفاد", "مخزون", "تخلص", "ناقص"]) &&
      includesAny(text, ["قطع", "اصناف", "الصنف"])
    )
  ) {
    const focus = includesAny(text, ["كم", "كام", "عدد"]) ? "count_only" : "list";

    return {
      ...base,
      mode: "query",
      intent: "low_stock_items",
      confidence: 0.9,
      metric: "low_stock_count",
      group_by: "part",
      filters: {
        ...base.filters,
        range: null,
        focus,
      },
      options: {
        ...base.options,
        limit: limit || 10,
        response_type: focus === "count_only" ? "summary" : "table",
      },
    };
  }

  return null;
}

function parseReferenceFollowUp(question, base) {
  const text = base.normalized_question;

  if (includesAny(text, ["الاول", "الأول", "اول واحد", "اول عميل", "اول مركبه", "اول صنف"])) {
    return {
      ...base,
      mode: "reference_followup",
      intent: "reference_previous_item",
      confidence: 0.85,
      entities: {
        ...base.entities,
        ordinal_ref: 1,
      },
      options: {
        ...base.options,
        response_type: "table",
      },
    };
  }

  if (includesAny(text, ["الثاني", "تاني واحد", "العميل الثاني", "المركبه الثانيه"])) {
    return {
      ...base,
      mode: "reference_followup",
      intent: "reference_previous_item",
      confidence: 0.8,
      entities: {
        ...base.entities,
        ordinal_ref: 2,
      },
      options: {
        ...base.options,
        response_type: "table",
      },
    };
  }

  if (includesAny(text, ["نفس العميل", "نفس المركبه", "نفس العربية", "نفس الصنف", "نفسه", "نفسها"])) {
    return {
      ...base,
      mode: "reference_followup",
      intent: "reference_previous_entity",
      confidence: 0.78,
      entities: {
        ...base.entities,
        same_as_previous: true,
      },
      options: {
        ...base.options,
        response_type: "table",
      },
    };
  }

  if (
    includesAny(text, [
      "اعرض اعلى 10",
      "اعرض اعلي 10",
      "اعرض 10",
      "هات 10",
      "طلع 10",
      "top 10",
    ])
  ) {
    return {
      ...base,
      mode: "reference_followup",
      intent: "reference_previous_expand_limit",
      confidence: 0.82,
      options: {
        ...base.options,
        limit: 10,
        response_type: "table",
      },
    };
  }

  return null;
}

function parseAiQuestion({ question, context = null, user, body = {} }) {
  const base = buildBaseParsed({ question, context, user, body });

  const action = detectAction(question, body, base);
  if (action) return action;

  const refFollowup = parseReferenceFollowUp(question, base);
  if (refFollowup) return refFollowup;

  const moduleName = base.module;
  let parsed = null;

  if (moduleName === "finance") parsed = parseFinance(question, base);
  if (!parsed && moduleName === "ar") parsed = parseAr(question, base);
  if (!parsed && moduleName === "maintenance") parsed = parseMaintenance(question, base);
  if (!parsed && moduleName === "inventory") parsed = parseInventory(question, base);

  if (parsed) return parsed;

  parsed =
    parseFinance(question, base) ||
    parseAr(question, base) ||
    parseMaintenance(question, base) ||
    parseInventory(question, base);

  if (parsed) return parsed;

  return base;
}

module.exports = {
  parseAiQuestion,
  allowedModulesByRole,
};