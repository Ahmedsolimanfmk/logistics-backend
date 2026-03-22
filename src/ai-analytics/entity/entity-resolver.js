function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getEntityContext(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return {
      primary_entity: null,
      last_entities: [],
    };
  }

  return snapshot.entity_context || {
    primary_entity: null,
    last_entities: [],
  };
}

function buildError(message, code) {
  return {
    ok: false,
    code,
    message,
  };
}

function buildSuccess(entity) {
  return {
    ok: true,
    entity,
  };
}

function resolveIndexedReference(text, snapshot) {
  const t = normalizeText(text);
  const ctx = getEntityContext(snapshot);

  const indexMap = {
    "الأول": 0,
    "اول": 0,
    "الأولى": 0,
    "1": 0,

    "الثاني": 1,
    "الثانية": 1,
    "2": 1,

    "الثالث": 2,
    "الثالثة": 2,
    "3": 2,

    "الرابع": 3,
    "الرابعة": 3,
    "4": 3,

    "الخامس": 4,
    "الخامسة": 4,
    "5": 4,
  };

  if (!(t in indexMap)) return null;

  const entities = Array.isArray(ctx.last_entities) ? ctx.last_entities : [];
  if (!entities.length) {
    return buildError("لا توجد قائمة سابقة للاختيار منها.", "NO_LIST");
  }

  const entity = entities[indexMap[t]];
  if (!entity) {
    return buildError("العنصر المطلوب غير موجود في النتائج السابقة.", "OUT_OF_RANGE");
  }

  return buildSuccess(entity);
}

function resolveContextReference(text, snapshot) {
  const t = normalizeText(text);
  const ctx = getEntityContext(snapshot);

  const primaryRefWords = [
    "نفس العميل",
    "العميل نفسه",
    "نفس المركبة",
    "المركبة نفسها",
    "نفس السيارة",
    "السيارة نفسها",
    "هو",
    "هي",
    "هذا",
    "هذه",
    "ده",
    "دي",
  ];

  if (!primaryRefWords.includes(t)) return null;

  if (!ctx.primary_entity) {
    return buildError("لا يوجد عنصر حالي يمكن الرجوع إليه.", "NO_CONTEXT");
  }

  return buildSuccess(ctx.primary_entity);
}

module.exports = {
  resolveIndexedReference,
  resolveContextReference,
};