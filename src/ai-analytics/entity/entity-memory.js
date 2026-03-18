function getEntityContext(snapshot) {
  const safeSnapshot = snapshot && typeof snapshot === "object" ? snapshot : {};

  if (!safeSnapshot.entity_context) {
    safeSnapshot.entity_context = {
      primary_entity: null,
      last_entities: [],
      selected_index: null,
      selected_entity_type: null,
      history_refs: {
        client: null,
        vehicle: null,
        trip: null,
        site: null,
        work_order: null,
      },
    };
  }

  return safeSnapshot.entity_context;
}

function ensureSnapshot(snapshot) {
  const safeSnapshot = snapshot && typeof snapshot === "object" ? snapshot : {};
  getEntityContext(safeSnapshot);
  return safeSnapshot;
}

function setPrimaryEntity(snapshot, entity) {
  const safeSnapshot = ensureSnapshot(snapshot);
  const ctx = getEntityContext(safeSnapshot);

  ctx.primary_entity = entity || null;
  ctx.selected_entity_type = entity?.type || null;
  ctx.selected_index =
    typeof entity?.index === "number" ? entity.index : ctx.selected_index;

  if (entity?.type) {
    ctx.history_refs[entity.type] = {
      id: entity.id || null,
      label: entity.label || null,
      index: typeof entity.index === "number" ? entity.index : null,
    };
  }

  safeSnapshot.entity_context = ctx;
  return safeSnapshot;
}

function setLastEntities(snapshot, entities = []) {
  const safeSnapshot = ensureSnapshot(snapshot);
  const ctx = getEntityContext(safeSnapshot);

  ctx.last_entities = (Array.isArray(entities) ? entities : [])
    .filter(Boolean)
    .map((entity, index) => ({
      type: entity.type || null,
      id: entity.id || null,
      label: entity.label || null,
      raw: entity.raw || null,
      index,
    }))
    .filter((item) => item.type && item.id);

  safeSnapshot.entity_context = ctx;
  return safeSnapshot;
}

function attachEntityContextToSnapshot(snapshot, meta = {}) {
  const safeSnapshot = ensureSnapshot(snapshot);
  const ctx = getEntityContext(safeSnapshot);

  safeSnapshot.entity_context = ctx;
  safeSnapshot.entity_context_meta = {
    updated_at: new Date().toISOString(),
    source_module: meta.source_module || null,
    source_intent: meta.source_intent || null,
  };

  return safeSnapshot;
}

module.exports = {
  ensureSnapshot,
  getEntityContext,
  setPrimaryEntity,
  setLastEntities,
  attachEntityContextToSnapshot,
};