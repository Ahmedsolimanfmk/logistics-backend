const {
  ensureSnapshot,
  setPrimaryEntity,
  setLastEntities,
  attachEntityContextToSnapshot,
} = require("./entity-memory");

const {
  resolveIndexedReference,
  resolveContextReference,
} = require("./entity-resolver");

function extractItemsFromResult(result) {
  if (Array.isArray(result?.data?.items)) return result.data.items;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result)) return result;
  return [];
}

function pickValue(obj, keys = []) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return null;
}

function buildEntity(type, item, idKeys, labelKeys) {
  const id = pickValue(item, idKeys);
  const label = pickValue(item, labelKeys);

  if (!type || !id) return null;

  return {
    type,
    id,
    label: label || String(id),
    raw: item,
  };
}

function mapItemToEntity(item, parsed) {
  if (!item || typeof item !== "object") return null;

  const intent = parsed?.intent || "";
  const moduleName = parsed?.module || parsed?.domain || "";

  if (intent === "top_debtors") {
    return buildEntity(
      "client",
      item,
      ["client_id", "id", "client_name", "name"],
      ["client_name", "name", "client"]
    );
  }

  if (intent === "top_clients_by_trips") {
    return buildEntity(
      "client",
      item,
      ["client_id", "id", "client_name", "name"],
      ["client_name", "name", "client"]
    );
  }

  if (intent === "top_sites_by_trips") {
    return buildEntity(
      "site",
      item,
      ["site_id", "id", "site_name", "name"],
      ["site_name", "name", "site"]
    );
  }

  if (
    intent === "top_vehicles_by_trips" ||
    intent === "maintenance_cost_by_vehicle" ||
    intent === "expense_by_vehicle"
  ) {
    return buildEntity(
      "vehicle",
      item,
      ["vehicle_id", "id", "vehicle_name", "display_name", "fleet_no", "plate_no"],
      ["vehicle_name", "display_name", "fleet_no", "plate_no", "name", "vehicle"]
    );
  }

  if (intent === "active_trips" || moduleName === "trips") {
    return buildEntity(
      "trip",
      item,
      ["trip_id", "id", "trip_code", "trip_no", "reference_no"],
      ["trip_code", "trip_no", "reference_no", "name", "id"]
    );
  }

  return null;
}

function extractEntitiesFromResult({ parsed, result }) {
  const items = extractItemsFromResult(result);

  return items
    .map((item) => mapItemToEntity(item, parsed))
    .filter((entity) => entity && entity.type && entity.id);
}

function buildSelectionFollowUps(entity) {
  if (entity?.type === "client") {
    return ["رحلاته", "مديونيته", "مصروفاته"];
  }

  if (entity?.type === "vehicle") {
    return ["صيانتها", "رحلاتها", "مصروفاتها"];
  }

  if (entity?.type === "site") {
    return ["رحلاته"];
  }

  if (entity?.type === "trip") {
    return ["اعرض التفاصيل"];
  }

  return ["اعرض التفاصيل"];
}

function buildEntitySelectionResponse({ parsed, entity, snapshot }) {
  const updatedSnapshot = setPrimaryEntity(snapshot, entity);

  return {
    ok: true,
    parsed: {
      ...parsed,
      resolved_entity: entity,
      derived_from_context: true,
    },
    intent: parsed,
    mode: "reference_followup",
    ui: {
      mode: "reference_followup",
      title: "تم تحديد العنصر المطلوب",
      summary: entity?.label
        ? `تم اختيار "${entity.label}" من النتائج السابقة.`
        : "تم تحديد العنصر المطلوب من النتائج السابقة.",
      badges: ["متابعة", "Entity Intelligence"],
      result_type: "summary",
      has_items: false,
    },
    result: {
      data: {
        selected_entity: entity,
      },
    },
    answer: entity?.label
      ? `تم اختيار "${entity.label}" ويمكنك الآن المتابعة بأسئلة مثل رحلاته أو مديونيته أو صيانتها حسب نوع العنصر.`
      : "تم تحديد العنصر المطلوب من النتائج السابقة.",
    followUps: buildSelectionFollowUps(entity),
    insights: [],
    session_snapshot: attachEntityContextToSnapshot(updatedSnapshot, {
      source_module: parsed?.module || parsed?.domain || null,
      source_intent: parsed?.intent || null,
    }),
  };
}

function buildResolveErrorResponse({ parsed, message, snapshot }) {
  return {
    ok: true,
    parsed,
    intent: parsed,
    mode: "unknown",
    ui: {
      mode: "unknown",
      title: "تعذر تحديد المرجع",
      summary: message,
      badges: ["متابعة"],
      result_type: "summary",
      has_items: false,
    },
    result: null,
    answer: message,
    followUps: [
      "اعرض أعلى 5 عملاء مديونية",
      "اعرض أعلى 5 مركبات حسب الرحلات",
      "اعرض أعلى 5 مواقع حسب الرحلات",
    ],
    insights: [],
    session_snapshot: attachEntityContextToSnapshot(
      ensureSnapshot(snapshot),
      {}
    ),
  };
}

function resolveEntityFromText({ text, snapshot }) {
  return (
    resolveIndexedReference(text, snapshot) ||
    resolveContextReference(text, snapshot) ||
    null
  );
}

function handleEntityIntelligenceFollowUp({ parsed, question, snapshot }) {
  const safeSnapshot = ensureSnapshot(snapshot);
  const resolved = resolveEntityFromText({
    text: question,
    snapshot: safeSnapshot,
  });

  if (!resolved) return null;

  if (!resolved.ok) {
    return buildResolveErrorResponse({
      parsed,
      message: resolved.message,
      snapshot: safeSnapshot,
    });
  }

  return buildEntitySelectionResponse({
    parsed,
    entity: resolved.entity,
    snapshot: safeSnapshot,
  });
}

function enrichSessionSnapshotWithEntities({ parsed, result, snapshot }) {
  const safeSnapshot = ensureSnapshot(snapshot);
  const entities = extractEntitiesFromResult({ parsed, result });

  if (entities.length > 0) {
    setLastEntities(safeSnapshot, entities);
  }

  return attachEntityContextToSnapshot(safeSnapshot, {
    source_module: parsed?.module || parsed?.domain || null,
    source_intent: parsed?.intent || null,
  });
}

module.exports = {
  handleEntityIntelligenceFollowUp,
  enrichSessionSnapshotWithEntities,
};