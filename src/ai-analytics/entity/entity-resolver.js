const { getEntityContext } = require("./entity-memory");

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
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

  if (!(t in indexMap)) {
    return null;
  }

  if (!Array.isArray(ctx.last_entities) || !ctx.last_entities.length) {
    return {
      ok: false,
      code: "NO_LIST",
      message: "لا توجد قائمة سابقة للاختيار منها.",
    };
  }

  const idx = indexMap[t];
  const entity = ctx.last_entities[idx];

  if (!entity) {
    return {
      ok: false,
      code: "OUT_OF_RANGE",
      message: "العنصر المطلوب غير موجود في النتائج السابقة.",
    };
  }

  return {
    ok: true,
    entity,
  };
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

  if (!primaryRefWords.includes(t)) {
    return null;
  }

  if (!ctx.primary_entity) {
    return {
      ok: false,
      code: "NO_CONTEXT",
      message: "لا يوجد عنصر حالي يمكن الرجوع إليه.",
    };
  }

  return {
    ok: true,
    entity: ctx.primary_entity,
  };
}

module.exports = {
  resolveIndexedReference,
  resolveContextReference,
};