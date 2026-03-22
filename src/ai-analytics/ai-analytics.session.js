function pickItems(result) {
  if (Array.isArray(result?.data?.items)) return result.data.items;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function pickFirstNonEmpty(obj, keys = []) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
}

function inferEntityFromItem(item) {
  if (!item || typeof item !== "object") return null;

  return {
    client_hint: pickFirstNonEmpty(item, ["client_name"]),
    site_hint: pickFirstNonEmpty(item, ["site_name"]),
    vehicle_hint: pickFirstNonEmpty(item, [
      "display_name",
      "vehicle_name",
      "fleet_no",
      "plate_no",
    ]),
  };
}

function buildAppliedEntities(parsed) {
  return {
    client_hint: parsed?.entities?.client_hint || null,
    site_hint: parsed?.entities?.site_hint || null,
    vehicle_hint: parsed?.entities?.vehicle_hint || null,
    trip_hint: parsed?.entities?.trip_hint || null,
    work_order_hint: parsed?.entities?.work_order_hint || null,
  };
}

function buildSessionSnapshot({ parsed, result }) {
  const items = pickItems(result).slice(0, 20);
  const firstItem = items[0] || null;

  return {
    parsed: parsed || null,
    items,
    first_item: firstItem,
    first_entity: inferEntityFromItem(firstItem),
    applied_entities: buildAppliedEntities(parsed),
    count: items.length,
    created_at: new Date().toISOString(),
  };
}

function resolveByOrdinalRef(snapshot, ordinalRef) {
  const idx = Math.max(1, Number(ordinalRef)) - 1;
  const item = Array.isArray(snapshot?.items) ? snapshot.items[idx] : null;

  return {
    ok: Boolean(item),
    resolved_item: item || null,
    resolved_entity: inferEntityFromItem(item),
    snapshot,
  };
}

function resolveBySameAsPrevious(snapshot) {
  const item = snapshot?.first_item || null;

  return {
    ok: Boolean(item),
    resolved_item: item,
    resolved_entity: inferEntityFromItem(item),
    snapshot,
  };
}

function resolveReferenceFollowUp({ parsed, body }) {
  const snapshot = body?.session_snapshot || null;
  if (!snapshot || !parsed) return null;
  if (parsed.mode !== "reference_followup") return null;

  if (parsed.entities?.ordinal_ref) {
    return resolveByOrdinalRef(snapshot, parsed.entities.ordinal_ref);
  }

  if (parsed.entities?.same_as_previous) {
    return resolveBySameAsPrevious(snapshot);
  }

  return null;
}

module.exports = {
  buildSessionSnapshot,
  resolveReferenceFollowUp,
};