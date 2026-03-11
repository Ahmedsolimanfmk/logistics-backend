function pickItems(result) {
  if (Array.isArray(result?.data?.items)) return result.data.items;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function buildSessionSnapshot({ parsed, result }) {
  const items = pickItems(result);

  return {
    parsed: parsed || null,
    items: items.slice(0, 20),
    first_item: items[0] || null,
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
      snapshot,
    };
  }

  if (parsed.entities?.same_as_previous) {
    return {
      ok: Boolean(snapshot.first_item),
      resolved_item: snapshot.first_item || null,
      snapshot,
    };
  }

  return null;
}

module.exports = {
  buildSessionSnapshot,
  resolveReferenceFollowUp,
};