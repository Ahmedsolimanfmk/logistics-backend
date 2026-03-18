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

function mapItemToEntity(item, parsed) {
  if (!item || typeof item !== "object") return null;

  const intent = parsed?.intent || "";
  const moduleName = parsed?.module || parsed?.domain || "";

  if (intent === "top_debtors") {
    return {
      type: "client",
      id: pickValue(item, ["client_id", "id", "client_name", "name"]),
      label: pickValue(item, ["client_name", "name", "client"]),
      raw: item,
    };
  }

  if (intent === "top_clients_by_trips") {
    return {
      type: "client",
      id: pickValue(item, ["client_id", "id", "client_name", "name"]),
      label: pickValue(item, ["client_name", "name", "client"]),
      raw: item,
    };
  }

  if (intent === "top_sites_by_trips") {
    return {
      type: "site",
      id: pickValue(item, ["site_id", "id", "site_name", "name"]),
      label: pickValue(item, ["site_name", "name", "site"]),
      raw: item,
    };
  }

  if (
    intent === "top_vehicles_by_trips" ||
    intent === "maintenance_cost_by_vehicle" ||
    intent === "expense_by_vehicle"
  ) {
    return {
      type: "vehicle",
      id: pickValue(item, [
        "vehicle_id",
        "id",
        "vehicle_name",
        "display_name",
        "fleet_no",
        "plate_no",
      ]),
      label: pickValue(item, [
        "vehicle_name",
        "display_name",
        "fleet_no",
        "plate_no",
        "name",
        "vehicle",
      ]),
      raw: item,
    };
  }

  if (intent === "active_trips" || moduleName === "trips") {
    const tripId = pickValue(item, ["trip_id", "id"]);
    const tripLabel = pickValue(item, [
      "trip_code",
      "trip_no",
      "reference_no",
      "name",
    ]);

    if (tripId || tripLabel) {
      return {
        type: "trip",
        id: tripId || tripLabel,
        label: tripLabel || String(tripId),
        raw: item,
      };
    }
  }

  return null;
}

function extractEntitiesFromResult({ parsed, result }) {
  const items = extractItemsFromResult(result);

  return items
    .map((item) => mapItemToEntity(item, parsed))
    .filter((entity) => entity && entity.type && entity.id);
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
    followUps:
      entity?.type === "client"
        ? ["رحلاته", "مديونيته", "مصروفاته"]
        : entity?.type === "vehicle"
        ? ["صيانتها", "رحلاتها", "مصروفاتها"]
        : entity?.type === "site"
        ? ["رحلاته"]
        : ["اعرض التفاصيل"],
    insights: [],
    session_snapshot: attachEntityContextToSnapshot(updatedSnapshot, {
      source_module: parsed?.module || parsed?.domain || null,
      source_intent: parsed?.intent || null,
    }),
  };
}

function resolveEntityFromText({ text, snapshot }) {
  const indexed = resolveIndexedReference(text, snapshot);
  if (indexed) return indexed;

  const contextual = resolveContextReference(text, snapshot);
  if (contextual) return contextual;

  return null;
}

function handleEntityIntelligenceFollowUp({ parsed, question, snapshot }) {
  const resolved = resolveEntityFromText({
    text: question,
    snapshot,
  });

  if (!resolved) return null;

  if (!resolved.ok) {
    return {
      ok: true,
      parsed,
      intent: parsed,
      mode: "unknown",
      ui: {
        mode: "unknown",
        title: "تعذر تحديد المرجع",
        summary: resolved.message,
        badges: ["متابعة"],
        result_type: "summary",
        has_items: false,
      },
      result: null,
      answer: resolved.message,
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

  return buildEntitySelectionResponse({
    parsed,
    entity: resolved.entity,
    snapshot: ensureSnapshot(snapshot),
  });
}

function enrichSessionSnapshotWithEntities({ parsed, result, snapshot }) {
  const safeSnapshot = ensureSnapshot(snapshot);
  const entities = extractEntitiesFromResult({ parsed, result });

  if (entities.length) {
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