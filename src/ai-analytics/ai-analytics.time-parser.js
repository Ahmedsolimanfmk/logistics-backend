const { SYNONYMS } = require("./ai-analytics.synonyms");
const {
  normalizeArabicText,
  includesAny,
} = require("./ai-analytics.normalize");

const { resolveTimeFilters } = require("./ai-analytics.time-parser");
const {
  extractVehicleHint,
  extractClientHint,
  extractSiteHint,
  extractTripHint,
  extractWorkOrderHint,
  extractAmount,
  extractExpenseType,
  extractTitle,
  extractVendorName,
  extractPaidMethod,
} = require("./ai-analytics.extractors");

function roleUpper(role) {
  return String(role || "").trim().toUpperCase();
}

function allowedModulesByRole(role) {
  const r = roleUpper(role);

  if (r === "ADMIN") return ["finance", "ar", "maintenance", "inventory", "trips"];
  if (r === "ACCOUNTANT") return ["finance", "ar", "trips"];
  if (r === "STOREKEEPER") return ["inventory"];
  if (r === "FIELD_SUPERVISOR") return ["finance", "maintenance", "trips"];
  if (r === "HR") return ["maintenance", "trips"];

  return ["maintenance", "inventory", "trips"];
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
    trips: 0,
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
      client_hint: extractClientHint(question) || null,
      part_hint: null,
      site_hint: extractSiteHint(question) || null,
      expense_type: extractExpenseType(question) || null,
      vendor_name: extractVendorName(question) || null,
      paid_method: extractPaidMethod(question) || null,
      ordinal_ref: null,
      same_as_previous: false,
      possessive_owner_type: null,
      possessive_owner_label: null,
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

function applySnapshotEntityHints(base, body = {}) {
  const snapshot = body?.session_snapshot || null;
  const applied = snapshot?.applied_entities || {};
  const firstEntity = snapshot?.first_entity || null;
  const primaryEntity = snapshot?.entity_context?.primary_entity || null;

  return {
    ...base,
    entities: {
      ...base.entities,
      vehicle_hint:
        base?.entities?.vehicle_hint ||
        applied?.vehicle_hint ||
        firstEntity?.vehicle_hint ||
        (primaryEntity?.type === "vehicle" ? primaryEntity?.label : null) ||
        null,
      client_hint:
        base?.entities?.client_hint ||
        applied?.client_hint ||
        firstEntity?.client_hint ||
        (primaryEntity?.type === "client" ? primaryEntity?.label : null) ||
        null,
      site_hint:
        base?.entities?.site_hint ||
        applied?.site_hint ||
        firstEntity?.site_hint ||
        (primaryEntity?.type === "site" ? primaryEntity?.label : null) ||
        null,
      possessive_owner_type: primaryEntity?.type || null,
      possessive_owner_label: primaryEntity?.label || null,
    },
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

  if (
    (
      includesAny(text, ["مركبه", "مركبات", "العربيه", "العربية", "سياره", "سيارات"]) &&
      includesAny(text, ["مصروف", "مصروفات", "صرف"]) &&
      includesAny(text, ["اعلى", "اعلي", "اكثر", "اكبر", "top", "مين", "انهي", "أي"])
    ) ||
    includesAny(text, [
      "اعلى مركبه صرفا",
      "اعلى مركبة صرفا",
      "اكثر مركبه صرفا",
      "اكثر مركبة صرفا",
      "اكبر مركبه صرفا",
      "اكبر مركبة صرفا",
      "اعرض اعلى 5 مركبات صرفا",
      "اعرض اعلى 5 مركبات مصروفات",
      "اعلى المركبات صرفا",
      "المصروفات حسب المركبه",
      "المصروفات حسب المركبة",
    ])
  ) {
    const finalLimit = limit || (qType === "top" ? 5 : 1);

    return {
      ...base,
      mode: "query",
      intent: "expense_by_vehicle",
      confidence: 0.93,
      metric: "expense_amount",
      group_by: "vehicle",
      options: {
        ...base.options,
        limit: finalLimit,
        response_type: finalLimit > 1 ? "table" : "summary",
      },
    };
  }

  if (
    (
      includesAny(text, ["مصدر", "مصادر", "طريقه", "طريقة", "وسيله", "وسيلة"]) &&
      includesAny(text, ["الدفع", "سداد"]) &&
      includesAny(text, ["مصروف", "مصروفات", "صرف"])
    ) ||
    includesAny(text, [
      "المصروفات حسب مصدر الدفع",
      "المصروفات حسب طريقة الدفع",
      "الصرف حسب مصدر الدفع",
      "الصرف من العهده ولا الشركه",
      "الصرف من العهده ولا الشركة",
      "كم من العهده وكم من الشركه",
      "كم من العهدة وكم من الشركة",
    ])
  ) {
    return {
      ...base,
      mode: "query",
      intent: "expense_by_payment_source",
      confidence: 0.92,
      metric: "expense_amount",
      group_by: "payment_source",
      options: {
        ...base.options,
        response_type: "table",
      },
    };
  }

  if (
    (
      includesAny(text, ["مورد", "المورد", "موردين", "الموردين", "vendor", "supplier"]) &&
      includesAny(text, ["مصروف", "مصروفات", "صرف"]) &&
      includesAny(text, ["اعلى", "اعلي", "اكثر", "اكبر", "top", "مين", "من"])
    ) ||
    includesAny(text, [
      "اعلى مورد مصروفات",
      "اكبر مورد مصروفات",
      "اكثر مورد مصروفات",
      "اعرض اعلى 5 موردين مصروفات",
      "اعرض اعلى 5 موردين",
      "اعلى الموردين مصروفات",
    ])
  ) {
    const finalLimit = limit || (qType === "top" ? 5 : 1);

    return {
      ...base,
      mode: "query",
      intent: "top_vendors",
      confidence: 0.91,
      metric: "expense_amount",
      group_by: "vendor",
      options: {
        ...base.options,
        limit: finalLimit,
        response_type: finalLimit > 1 ? "table" : "summary",
      },
    };
  }

  if (
    (
      includesAny(text, ["مصروف", "مصروفات"]) &&
      includesAny(text, ["معلق", "معلقه", "معلقة", "بانتظار", "pending"])
    ) ||
    includesAny(text, [
      "كم المصروفات المعلقه",
      "كم المصروفات المعلقة",
      "كام المصروفات المعلقه",
      "كام المصروفات المعلقة",
      "اعرض حالات اعتماد المصروفات",
      "المصروفات حسب حالة الاعتماد",
      "حالات المصروفات",
    ])
  ) {
    return {
      ...base,
      mode: "query",
      intent: "expense_approval_breakdown",
      confidence: 0.9,
      metric: "expense_amount",
      group_by: "approval_status",
      options: {
        ...base.options,
        response_type: "table",
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

function parseTripsFollowup(question, base, body = {}) {
  const text = base.normalized_question;
  const snapshot = body?.session_snapshot || null;
  const hasClient = Boolean(base?.entities?.client_hint || snapshot?.applied_entities?.client_hint);
  const hasSite = Boolean(base?.entities?.site_hint || snapshot?.applied_entities?.site_hint);
  const hasVehicle = Boolean(base?.entities?.vehicle_hint || snapshot?.applied_entities?.vehicle_hint);

  if (
    includesAny(text, [
      "رحلاته هذا الشهر",
      "رحلاتها هذا الشهر",
      "رحلات العميل هذا الشهر",
      "رحلات المركبة هذا الشهر",
      "رحلات الموقع هذا الشهر",
      "اعرض رحلاته",
      "اعرض رحلاتها",
      "الرحلات الخاصة به",
      "الرحلات الخاصة بها",
      "رحلاته",
      "رحلاتها",
    ])
  ) {
    if (hasClient || hasSite || hasVehicle) {
      return {
        ...base,
        mode: "query",
        module: "trips",
        domain: "trips",
        intent: "trips_summary",
        confidence: 0.88,
        metric: "total_trips",
        group_by: null,
        options: {
          ...base.options,
          response_type: "summary",
        },
      };
    }
  }

  if (
    includesAny(text, [
      "الرحلات النشطة له",
      "الرحلات النشطة لها",
      "الرحلات النشطة للمركبة",
      "الرحلات النشطة للعميل",
      "الرحلات النشطة للموقع",
      "النشطة فقط",
      "رحلاته النشطة",
      "رحلاتها النشطة",
    ])
  ) {
    if (hasClient || hasSite || hasVehicle) {
      return {
        ...base,
        mode: "query",
        module: "trips",
        domain: "trips",
        intent: "active_trips",
        confidence: 0.9,
        metric: "active_trips_count",
        group_by: "trip",
        options: {
          ...base.options,
          limit: base.options.limit || 5,
          response_type: "table",
        },
      };
    }
  }

  if (
    includesAny(text, [
      "التي تحتاج إغلاق مالي",
      "التي تحتاج اغلاق مالي",
      "رحلاته التي تحتاج إغلاق مالي",
      "رحلاتها التي تحتاج إغلاق مالي",
      "الرحلات التي تحتاج إغلاق مالي له",
      "الرحلات التي تحتاج إغلاق مالي للمركبة",
      "الرحلات التي تحتاج إغلاق مالي للموقع",
      "اغلاق مالي فقط",
      "إغلاق مالي فقط",
    ])
  ) {
    if (hasClient || hasSite || hasVehicle) {
      return {
        ...base,
        mode: "query",
        module: "trips",
        domain: "trips",
        intent: "trips_need_financial_closure",
        confidence: 0.9,
        metric: "need_financial_closure_count",
        group_by: "trip",
        options: {
          ...base.options,
          limit: base.options.limit || 5,
          response_type: "table",
        },
      };
    }
  }

  return null;
}

function parsePossessiveFollowUp(question, base, body = {}) {
  const text = base.normalized_question;
  const snapshot = body?.session_snapshot || null;
  const primaryEntity = snapshot?.entity_context?.primary_entity || null;

  const ownerType = primaryEntity?.type || null;
  const ownerLabel = primaryEntity?.label || null;

  if (!ownerType || !ownerLabel) return null;

  if (includesAny(text, ["مديونيته", "مديونيتها", "مستحقاته", "مستحقاتها"])) {
    if (ownerType !== "client") {
      return {
        ...base,
        mode: "unsupported_followup",
        module: "ar",
        domain: "ar",
        intent: "unsupported_possessive_relation",
        confidence: 0.8,
        unsupported_reason: "receivables_requires_client",
        options: {
          ...base.options,
          response_type: "summary",
        },
      };
    }

    return {
      ...base,
      mode: "query",
      module: "ar",
      domain: "ar",
      intent: "outstanding_summary",
      confidence: 0.9,
      metric: "total_outstanding",
      filters: {
        ...base.filters,
        focus: "summary",
      },
      entities: {
        ...base.entities,
        client_hint: base.entities.client_hint || ownerLabel,
      },
      options: {
        ...base.options,
        response_type: "summary",
      },
    };
  }

  if (includesAny(text, ["رحلاته", "رحلاتها"])) {
    if (!["client", "vehicle", "site"].includes(ownerType)) {
      return {
        ...base,
        mode: "unsupported_followup",
        module: "trips",
        domain: "trips",
        intent: "unsupported_possessive_relation",
        confidence: 0.8,
        unsupported_reason: "trips_requires_client_vehicle_site",
        options: {
          ...base.options,
          response_type: "summary",
        },
      };
    }

    const entities = { ...base.entities };

    if (ownerType === "client") {
      entities.client_hint = entities.client_hint || ownerLabel;
    } else if (ownerType === "vehicle") {
      entities.vehicle_hint = entities.vehicle_hint || ownerLabel;
    } else if (ownerType === "site") {
      entities.site_hint = entities.site_hint || ownerLabel;
    }

    return {
      ...base,
      mode: "query",
      module: "trips",
      domain: "trips",
      intent: "trips_summary",
      confidence: 0.9,
      metric: "total_trips",
      entities,
      options: {
        ...base.options,
        response_type: "summary",
      },
    };
  }

  if (includesAny(text, ["صيانته", "صيانتها"])) {
    if (ownerType !== "vehicle") {
      return {
        ...base,
        mode: "unsupported_followup",
        module: "maintenance",
        domain: "maintenance",
        intent: "unsupported_possessive_relation",
        confidence: 0.8,
        unsupported_reason: "maintenance_requires_vehicle",
        options: {
          ...base.options,
          response_type: "summary",
        },
      };
    }

    return {
      ...base,
      mode: "query",
      module: "maintenance",
      domain: "maintenance",
      intent: "maintenance_cost_by_vehicle",
      confidence: 0.9,
      metric: "maintenance_cost",
      group_by: "vehicle",
      entities: {
        ...base.entities,
        vehicle_hint: base.entities.vehicle_hint || ownerLabel,
      },
      options: {
        ...base.options,
        limit: 1,
        response_type: "summary",
      },
    };
  }

  if (includesAny(text, ["مصروفاته", "مصروفاتها", "مصاريفه", "مصاريفها"])) {
    if (!["vehicle", "client", "site"].includes(ownerType)) {
      return {
        ...base,
        mode: "unsupported_followup",
        module: "finance",
        domain: "finance",
        intent: "unsupported_possessive_relation",
        confidence: 0.8,
        unsupported_reason: "expenses_requires_supported_owner",
        options: {
          ...base.options,
          response_type: "summary",
        },
      };
    }

    const entities = { ...base.entities };

    if (ownerType === "vehicle") {
      entities.vehicle_hint = entities.vehicle_hint || ownerLabel;
    } else if (ownerType === "client") {
      entities.client_hint = entities.client_hint || ownerLabel;
    } else if (ownerType === "site") {
      entities.site_hint = entities.site_hint || ownerLabel;
    }

    return {
      ...base,
      mode: "query",
      module: "finance",
      domain: "finance",
      intent: "expense_summary",
      confidence: 0.9,
      metric: "total_expense",
      entities,
      options: {
        ...base.options,
        response_type: "summary",
      },
    };
  }

  if (
    includesAny(text, [
      "ربحه",
      "ربحها",
      "أرباحه",
      "ارباحه",
      "أرباحها",
      "ارباحها",
      "هل هو مربح",
      "هل هي مربحة",
    ])
  ) {
    if (ownerType !== "client") {
      return {
        ...base,
        mode: "unsupported_followup",
        module: "finance",
        domain: "finance",
        intent: "unsupported_possessive_relation",
        confidence: 0.8,
        unsupported_reason: "profit_requires_client",
        options: {
          ...base.options,
          response_type: "summary",
        },
      };
    }

    return {
      ...base,
      mode: "query",
      module: "finance",
      domain: "finance",
      intent: "entity_profit_summary",
      confidence: 0.9,
      metric: "profit",
      entities: {
        ...base.entities,
        client_hint: base.entities.client_hint || ownerLabel,
      },
      options: {
        ...base.options,
        response_type: "summary",
      },
    };
  }

  return null;
}

function parseTrips(question, base) {
  const text = base.normalized_question;
  const limit = base.options.limit;
  const qType = base.options.question_type;

  if (
    includesAny(text, SYNONYMS.trips?.summary || []) ||
    (
      includesAny(text, ["رحله", "رحلة", "رحلات", "الرحلات"]) &&
      includesAny(text, ["اجمالي", "إجمالي", "عدد", "كم", "كام"])
    )
  ) {
    return {
      ...base,
      mode: "query",
      module: "trips",
      domain: "trips",
      intent: "trips_summary",
      confidence: 0.91,
      metric: "total_trips",
      group_by: null,
      options: {
        ...base.options,
        response_type: "summary",
      },
    };
  }

  if (
    includesAny(text, SYNONYMS.trips?.active || []) ||
    (
      includesAny(text, ["رحله", "رحلة", "رحلات", "الرحلات"]) &&
      includesAny(text, ["نشطه", "نشطة", "جاريه", "جارية", "فعاله", "فعالة"])
    )
  ) {
    const finalLimit = limit || 5;

    return {
      ...base,
      mode: "query",
      module: "trips",
      domain: "trips",
      intent: "active_trips",
      confidence: 0.9,
      metric: "active_trips_count",
      group_by: "trip",
      options: {
        ...base.options,
        limit: finalLimit,
        response_type: finalLimit > 1 ? "table" : "summary",
      },
    };
  }

  if (
    includesAny(text, SYNONYMS.trips?.needFinancialClosure || []) ||
    (
      includesAny(text, ["رحله", "رحلة", "رحلات", "الرحلات"]) &&
      includesAny(text, ["اغلاق مالي", "إغلاق مالي", "مغلقه ماليا", "مغلقة ماليًا", "closure"])
    )
  ) {
    const finalLimit = limit || 5;

    return {
      ...base,
      mode: "query",
      module: "trips",
      domain: "trips",
      intent: "trips_need_financial_closure",
      confidence: 0.91,
      metric: "need_financial_closure_count",
      group_by: "trip",
      options: {
        ...base.options,
        limit: finalLimit,
        response_type: finalLimit > 1 ? "table" : "summary",
      },
    };
  }

  if (
    includesAny(text, [
      "اعرض اعلى 5 عملاء حسب الرحلات",
      "اعرض أعلى 5 عملاء حسب الرحلات",
      "اعلى 5 عملاء حسب الرحلات",
      "أعلى 5 عملاء حسب الرحلات",
      "اعرض اعلى 5 عملاء في عدد الرحلات",
      "اعرض أعلى 5 عملاء في عدد الرحلات",
      "اعلى عميل من حيث الرحلات",
      "أعلى عميل من حيث الرحلات",
      "من اعلى عميل من حيث الرحلات",
      "من أعلى عميل من حيث الرحلات",
      "ما اعلى عميل من حيث الرحلات",
      "ما أعلى عميل من حيث الرحلات",
    ]) ||
    includesAny(text, SYNONYMS.trips?.topClients || []) ||
    (
      includesAny(text, ["عميل", "العملاء", "عملاء"]) &&
      includesAny(text, ["رحله", "رحلة", "رحلات"]) &&
      includesAny(text, ["اعلى", "اعلي", "اكثر", "اكبر", "top", "مين", "من"])
    )
  ) {
    const finalLimit = limit || (qType === "top" ? 5 : 1);

    return {
      ...base,
      mode: "query",
      module: "trips",
      domain: "trips",
      intent: "top_clients_by_trips",
      confidence: 0.95,
      metric: "trips_count",
      group_by: "client",
      options: {
        ...base.options,
        limit: finalLimit,
        response_type: finalLimit > 1 ? "table" : "summary",
      },
    };
  }

  if (
    includesAny(text, [
      "اعرض اعلى 5 مواقع حسب الرحلات",
      "اعرض أعلى 5 مواقع حسب الرحلات",
      "اعلى 5 مواقع حسب الرحلات",
      "أعلى 5 مواقع حسب الرحلات",
      "اعرض اعلى 5 مواقع في عدد الرحلات",
      "اعرض أعلى 5 مواقع في عدد الرحلات",
      "اعرض اعلى المواقع حسب الرحلات",
      "اعرض أعلى المواقع حسب الرحلات",
      "اعلى موقع من حيث الرحلات",
      "أعلى موقع من حيث الرحلات",
      "من اعلى موقع من حيث الرحلات",
      "من أعلى موقع من حيث الرحلات",
      "ما اعلى موقع من حيث الرحلات",
      "ما أعلى موقع من حيث الرحلات",
    ]) ||
    includesAny(text, SYNONYMS.trips?.topSites || []) ||
    (
      includesAny(text, ["موقع", "الموقع", "المواقع", "site", "sites"]) &&
      includesAny(text, ["رحله", "رحلة", "رحلات"]) &&
      includesAny(text, ["اعلى", "اعلي", "اكثر", "اكبر", "top", "مين", "من"])
    )
  ) {
    const finalLimit = limit || (qType === "top" ? 5 : 1);

    return {
      ...base,
      mode: "query",
      module: "trips",
      domain: "trips",
      intent: "top_sites_by_trips",
      confidence: 0.95,
      metric: "trips_count",
      group_by: "site",
      options: {
        ...base.options,
        limit: finalLimit,
        response_type: finalLimit > 1 ? "table" : "summary",
      },
    };
  }

  if (
    includesAny(text, [
      "اعرض اعلى 5 مركبات حسب الرحلات",
      "اعرض أعلى 5 مركبات حسب الرحلات",
      "اعلى 5 مركبات حسب الرحلات",
      "أعلى 5 مركبات حسب الرحلات",
      "اعرض اعلى 5 مركبات في عدد الرحلات",
      "اعرض أعلى 5 مركبات في عدد الرحلات",
      "اعلى مركبة من حيث الرحلات",
      "أعلى مركبة من حيث الرحلات",
      "من اعلى مركبة من حيث الرحلات",
      "من أعلى مركبة من حيث الرحلات",
      "ما اعلى مركبة من حيث الرحلات",
      "ما أعلى مركبة من حيث الرحلات",
    ]) ||
    includesAny(text, SYNONYMS.trips?.topVehicles || []) ||
    (
      includesAny(text, ["مركبه", "مركبة", "مركبات", "عربيه", "عربية", "سياره", "سيارة", "سيارات"]) &&
      includesAny(text, ["رحله", "رحلة", "رحلات"]) &&
      includesAny(text, ["اعلى", "اعلي", "اكثر", "اكبر", "top", "مين", "من"])
    )
  ) {
    const finalLimit = limit || (qType === "top" ? 5 : 1);

    return {
      ...base,
      mode: "query",
      module: "trips",
      domain: "trips",
      intent: "top_vehicles_by_trips",
      confidence: 0.95,
      metric: "trips_count",
      group_by: "vehicle",
      options: {
        ...base.options,
        limit: finalLimit,
        response_type: finalLimit > 1 ? "table" : "summary",
      },
    };
  }

  if (
    includesAny(text, ["اعرض", "هات", "طلع"]) &&
    includesAny(text, ["5", "خمسه", "خمسة"]) &&
    includesAny(text, ["عملاء", "العملاء"])
  ) {
    return {
      ...base,
      mode: "query",
      module: "trips",
      domain: "trips",
      intent: "top_clients_by_trips",
      confidence: 0.85,
      metric: "trips_count",
      group_by: "client",
      options: {
        ...base.options,
        limit: 5,
        response_type: "table",
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
  let base = buildBaseParsed({ question, context, user, body });
  base = applySnapshotEntityHints(base, body);

  const action = detectAction(question, body, base);
  if (action) return action;

  const refFollowup = parseReferenceFollowUp(question, base);
  if (refFollowup) return refFollowup;

  const possessiveFollowup = parsePossessiveFollowUp(question, base, body);
  if (possessiveFollowup) return possessiveFollowup;

  const tripsFollowup = parseTripsFollowup(question, base, body);
  if (tripsFollowup) return tripsFollowup;

  const moduleName = base.module;
  let parsed = null;

  if (moduleName === "finance") parsed = parseFinance(question, base);
  if (!parsed && moduleName === "ar") parsed = parseAr(question, base);
  if (!parsed && moduleName === "maintenance") parsed = parseMaintenance(question, base);
  if (!parsed && moduleName === "inventory") parsed = parseInventory(question, base);
  if (!parsed && moduleName === "trips") parsed = parseTrips(question, base);

  if (parsed) return parsed;

  parsed =
    parseFinance(question, base) ||
    parseAr(question, base) ||
    parseMaintenance(question, base) ||
    parseInventory(question, base) ||
    parseTrips(question, base);

  if (parsed) return parsed;

  return base;
}

module.exports = {
  parseAiQuestion,
  allowedModulesByRole,
};