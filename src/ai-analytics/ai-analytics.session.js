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

  const clientHint = pickFirstNonEmpty(item, ["client_name"]);
  const siteHint = pickFirstNonEmpty(item, ["site_name"]);
  const vehicleHint = pickFirstNonEmpty(item, [
    "display_name",
    "vehicle_name",
    "fleet_no",
    "plate_no",
  ]);

  return {
    client_hint: clientHint,
    site_hint: siteHint,
    vehicle_hint: vehicleHint,
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

function buildPrimaryEntity({ parsed, firstEntity }) {
  const entityTypeFromParsed =
    parsed?.entities?.client_hint
      ? "client"
      : parsed?.entities?.site_hint
      ? "site"
      : parsed?.entities?.vehicle_hint
      ? "vehicle"
      : null;

  const entityLabelFromParsed =
    parsed?.entities?.client_hint ||
    parsed?.entities?.site_hint ||
    parsed?.entities?.vehicle_hint ||
    null;

  if (entityTypeFromParsed && entityLabelFromParsed) {
    return {
      type: entityTypeFromParsed,
      label: entityLabelFromParsed,
    };
  }

  if (firstEntity?.client_hint) {
    return {
      type: "client",
      label: firstEntity.client_hint,
    };
  }

  if (firstEntity?.site_hint) {
    return {
      type: "site",
      label: firstEntity.site_hint,
    };
  }

  if (firstEntity?.vehicle_hint) {
    return {
      type: "vehicle",
      label: firstEntity.vehicle_hint,
    };
  }

  return null;
}

function buildEntityContext({ parsed, firstEntity }) {
  return {
    primary_entity: buildPrimaryEntity({ parsed, firstEntity }),
  };
}

function buildSessionSnapshot({ parsed, result }) {
  const items = pickItems(result).slice(0, 20);
  const firstItem = items[0] || null;
  const firstEntity = inferEntityFromItem(firstItem);
  const appliedEntities = buildAppliedEntities(parsed);

  return {
    parsed: parsed || null,
    items,
    first_item: firstItem,
    first_entity: firstEntity,
    applied_entities: appliedEntities,
    entity_context: buildEntityContext({
      parsed,
      firstEntity,
    }),
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