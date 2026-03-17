function pickItems(result) {
  if (Array.isArray(result?.data?.items)) return result.data.items;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function inferEntityFromItem(item) {
  if (!item || typeof item !== "object") return null;

  return {
    client_hint: item.client_name || null,
    site_hint: item.site_name || null,
    vehicle_hint:
      item.display_name ||
      item.vehicle_name ||
      item.fleet_no ||
      item.plate_no ||
      null,
  };
}

function buildSessionSnapshot({ parsed, result }) {
  const items = pickItems(result);
  const firstItem = items[0] || null;

  return {
    parsed: parsed || null,
    items: items.slice(0, 20),
    first_item: firstItem,
    first_entity: inferEntityFromItem(firstItem),
    applied_entities: {
      client_hint: parsed?.entities?.client_hint || null,
      site_hint: parsed?.entities?.site_hint || null,
      vehicle_hint: parsed?.entities?.vehicle_hint || null,
      trip_hint: parsed?.entities?.trip_hint || null,
      work_order_hint: parsed?.entities?.work_order_hint || null,
    },
    count: items.length,
    created_at: new Date().toISOString(),
  };
}

function resolveReferenceFollowUp({ parsed, body }) {
  const snapshot = body?.session_snapshot || null;
  if (!snapshot || !parsed) return null;

  if (parsed.mode !== "reference_followup") return null;

  if (parsed.entities?.ordinal_ref) {
    const idx = Math.max(1, Number(parsed.entities.ordinal_ref)) - 1;
    const item = Array.isArray(snapshot.items) ? snapshot.items[idx] : null;

    return {
      ok: Boolean(item),
      resolved_item: item || null,
      resolved_entity: inferEntityFromItem(item),
      snapshot,
    };
  }

  if (parsed.entities?.same_as_previous) {
    return {
      ok: Boolean(snapshot.first_item),
      resolved_item: snapshot.first_item || null,
      resolved_entity: inferEntityFromItem(snapshot.first_item),
      snapshot,
    };
  }

  return null;
}

module.exports = {
  buildSessionSnapshot,
  resolveReferenceFollowUp,
};