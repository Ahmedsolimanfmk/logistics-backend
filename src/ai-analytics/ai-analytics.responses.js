const { buildSessionSnapshot } = require("./ai-analytics.session");
const { getFollowUpQuestions } = require("./ai-analytics.followups");

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

  if (entity?.client_hint) snapshot.applied_entities.client_hint = entity.client_hint;
  if (entity?.site_hint) snapshot.applied_entities.site_hint = entity.site_hint;
  if (entity?.vehicle_hint) snapshot.applied_entities.vehicle_hint = entity.vehicle_hint;

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

module.exports = {
  buildSimpleResponse,
  buildDefaultFollowUps,
  buildReferenceFallbackFollowUps,
  buildEntityUnsupportedFollowUps,
  buildUnknownResponse,
  buildUnsupportedFollowupResponse,
  buildReferenceFollowUpResponse,
  buildReferenceExpandLimitResponse,
  buildActionPreviewResponse,
};