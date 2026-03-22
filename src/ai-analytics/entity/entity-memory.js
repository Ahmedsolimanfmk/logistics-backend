function buildEmptyEntityContext() {
  return {
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

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getEntityContext(snapshot) {
  const safeSnapshot = ensureObject(snapshot);

  if (!safeSnapshot.entity_context || typeof safeSnapshot.entity_context !== "object") {
    safeSnapshot.entity_context = buildEmptyEntityContext();
    return safeSnapshot.entity_context;
  }

  const ctx = safeSnapshot.entity_context;

  ctx.primary_entity = ctx.primary_entity || null;
  ctx.last_entities = Array.isArray(ctx.last_entities) ? ctx.last_entities : [];
  ctx.selected_index =
    typeof ctx.selected_index === "number" ? ctx.selected_index : null;
  ctx.selected_entity_type = ctx.selected_entity_type || null;

  if (!ctx.history_refs || typeof ctx.history_refs !== "object") {
    ctx.history_refs = buildEmptyEntityContext().history_refs;
  } else {
    ctx.history_refs = {
      client: ctx.history_refs.client || null,
      vehicle: ctx.history_refs.vehicle || null,
      trip: ctx.history_refs.trip || null,
      site: ctx.history_refs.site || null,
      work_order: ctx.history_refs.work_order || null,
    };
  }

  safeSnapshot.entity_context = ctx;
  return ctx;
}

function ensureSnapshot(snapshot) {
  const safeSnapshot = ensureObject(snapshot);
  getEntityContext(safeSnapshot);
  return safeSnapshot;
}

function normalizeEntity(entity, index = null) {
  if (!entity || typeof entity !== "object") return null;
  if (!entity.type || !entity.id) return null;

  return {
    type: entity.type || null,
    id: entity.id || null,
    label: entity.label || null,
    raw: entity.raw || null,
    index: typeof index === "number" ? index : entity.index ?? null,
  };
}

function setPrimaryEntity(snapshot, entity) {
  const safeSnapshot = ensureSnapshot(snapshot);
  const ctx = getEntityContext(safeSnapshot);

  const normalized = normalizeEntity(entity);

  ctx.primary_entity = normalized;
  ctx.selected_entity_type = normalized?.type || null;
  ctx.selected_index =
    typeof normalized?.index === "number" ? normalized.index : null;

  if (normalized?.type) {
    ctx.history_refs[normalized.type] = {
      id: normalized.id || null,
      label: normalized.label || null,
      index: typeof normalized.index === "number" ? normalized.index : null,
    };
  }

  safeSnapshot.entity_context = ctx;
  return safeSnapshot;
}

function setLastEntities(snapshot, entities = []) {
  const safeSnapshot = ensureSnapshot(snapshot);
  const ctx = getEntityContext(safeSnapshot);

  ctx.last_entities = (Array.isArray(entities) ? entities : [])
    .map((entity, index) => normalizeEntity(entity, index))
    .filter(Boolean);

  safeSnapshot.entity_context = ctx;
  return safeSnapshot;
}

function attachEntityContextToSnapshot(snapshot, meta = {}) {
  const safeSnapshot = ensureSnapshot(snapshot);
  const ctx = getEntityContext(safeSnapshot);

  safeSnapshot.entity_context = ctx;
  safeSnapshot.entity_context_meta = {
    updated_at: new Date().toISOString(),
    source_module: meta?.source_module || null,
    source_intent: meta?.source_intent || null,
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