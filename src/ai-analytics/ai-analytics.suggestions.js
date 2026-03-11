function roleUpper(role) {
  return String(role || "").trim().toUpperCase();
}

function uniqueQuestions(items = []) {
  return Array.from(
    new Set(
      items
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  );
}

function buildFinanceQuestions() {
  return [
    "كم إجمالي المصروفات هذا الشهر؟",
    "قارن مصروفات هذا الشهر بالشهر الماضي",
    "ما أعلى نوع مصروف هذا الشهر؟",
    "اعرض أعلى 5 أنواع مصروف هذا الشهر",
    "ما أعلى مركبة صرفًا هذا الشهر؟",
    "اعرض أعلى 5 مركبات صرفًا هذا الشهر",
    "المصروفات حسب مصدر الدفع",
    "من أعلى مورد مصروفات هذا الشهر؟",
    "اعرض أعلى 5 موردين مصروفات",
    "كم المصروفات المعلقة هذا الشهر؟",
    "اعرض حالات اعتماد المصروفات",
  ];
}

function buildArQuestions() {
  return [
    "كم إجمالي مستحقات العملاء؟",
    "قيمة متأخرات العملاء كام؟",
    "من أعلى عميل مديونية؟",
    "اعرض أعلى 5 عملاء مديونية",
    "فلوسنا عند العملاء كام؟",
  ];
}

function buildMaintenanceQuestions() {
  return [
    "كم عدد أوامر العمل المفتوحة؟",
    "ما أعلى مركبة تكلفة صيانة؟",
    "اعرض أعلى 5 مركبات تكلفة صيانة",
  ];
}

function buildInventoryQuestions() {
  return [
    "ما أكثر قطع الغيار صرفًا هذا الشهر؟",
    "اعرض أعلى 5 أصناف صرفًا",
    "ما الأصناف القريبة من النفاد؟",
    "كام عدد الأصناف منخفضة المخزون؟",
  ];
}

function questionsByContext(context) {
  const c = String(context || "").trim().toLowerCase();

  if (c === "finance") return buildFinanceQuestions();
  if (c === "ar") return buildArQuestions();
  if (c === "maintenance") return buildMaintenanceQuestions();
  if (c === "inventory") return buildInventoryQuestions();

  return [
    ...buildFinanceQuestions(),
    ...buildArQuestions(),
    ...buildMaintenanceQuestions(),
    ...buildInventoryQuestions(),
  ];
}

function questionsByRole(role, context) {
  const r = roleUpper(role);
  const c = String(context || "").trim().toLowerCase();

  if (c) {
    return questionsByContext(c);
  }

  if (r === "ADMIN") {
    return [
      ...buildFinanceQuestions(),
      ...buildArQuestions(),
      ...buildMaintenanceQuestions(),
      ...buildInventoryQuestions(),
    ];
  }

  if (r === "ACCOUNTANT") {
    return [
      ...buildFinanceQuestions(),
      ...buildArQuestions(),
    ];
  }

  if (r === "FIELD_SUPERVISOR") {
    return [
      "كم إجمالي المصروفات هذا الشهر؟",
      "ما أعلى مركبة صرفًا هذا الشهر؟",
      "اعرض أعلى 5 مركبات صرفًا هذا الشهر",
      "كم عدد أوامر العمل المفتوحة؟",
      "ما أعلى مركبة تكلفة صيانة؟",
      "اعرض أعلى 5 مركبات تكلفة صيانة",
    ];
  }

  if (r === "STOREKEEPER") {
    return buildInventoryQuestions();
  }

  if (r === "HR") {
    return buildMaintenanceQuestions();
  }

  return [
    "كم إجمالي المصروفات هذا الشهر؟",
    "من أعلى عميل مديونية؟",
    "كم عدد أوامر العمل المفتوحة؟",
    "ما الأصناف القريبة من النفاد؟",
  ];
}

function buildDynamicFinanceQuestions(signals = {}) {
  const items = [];

  const pendingExpense = Number(signals.pendingExpense || 0);
  const rejectedExpense = Number(signals.rejectedExpense || 0);
  const topVehicleExpense = Number(signals.topVehicleExpense || 0);
  const topVendorExpense = Number(signals.topVendorExpense || 0);
  const advanceExpense = Number(signals.advanceExpense || 0);
  const companyExpense = Number(signals.companyExpense || 0);

  if (pendingExpense > 0) {
    items.push("كم المصروفات المعلقة هذا الشهر؟");
    items.push("اعرض حالات اعتماد المصروفات");
  }

  if (rejectedExpense > 0) {
    items.push("اعرض حالات اعتماد المصروفات");
  }

  if (topVehicleExpense > 0) {
    items.push("ما أعلى مركبة صرفًا هذا الشهر؟");
  }

  if (topVendorExpense > 0) {
    items.push("من أعلى مورد مصروفات هذا الشهر؟");
  }

  if (advanceExpense > 0 || companyExpense > 0) {
    items.push("المصروفات حسب مصدر الدفع");
  }

  return items;
}

function buildDynamicArQuestions(signals = {}) {
  const items = [];

  const overdueAmount = Number(signals.overdueAmount || 0);
  const totalOutstanding = Number(signals.totalOutstanding || 0);
  const topDebtorAmount = Number(signals.topDebtorAmount || 0);

  if (totalOutstanding > 0) {
    items.push("كم إجمالي مستحقات العملاء؟");
  }

  if (overdueAmount > 0) {
    items.push("قيمة متأخرات العملاء كام؟");
  }

  if (topDebtorAmount > 0) {
    items.push("من أعلى عميل مديونية؟");
    items.push("اعرض أعلى 5 عملاء مديونية");
  }

  return items;
}

function buildDynamicMaintenanceQuestions(signals = {}) {
  const items = [];

  const openWorkOrders = Number(signals.openWorkOrders || 0);
  const topVehicleMaintenanceCost = Number(signals.topVehicleMaintenanceCost || 0);

  if (openWorkOrders > 0) {
    items.push("كم عدد أوامر العمل المفتوحة؟");
  }

  if (topVehicleMaintenanceCost > 0) {
    items.push("ما أعلى مركبة تكلفة صيانة؟");
    items.push("اعرض أعلى 5 مركبات تكلفة صيانة");
  }

  return items;
}

function buildDynamicInventoryQuestions(signals = {}) {
  const items = [];

  const lowStockCount = Number(signals.lowStockCount || 0);
  const topIssuedQty = Number(signals.topIssuedQty || 0);

  if (topIssuedQty > 0) {
    items.push("ما أكثر قطع الغيار صرفًا هذا الشهر؟");
    items.push("اعرض أعلى 5 أصناف صرفًا");
  }

  if (lowStockCount > 0) {
    items.push("ما الأصناف القريبة من النفاد؟");
    items.push("كام عدد الأصناف منخفضة المخزون؟");
  }

  return items;
}

function getDynamicQuestions({ context = null, signals = {} }) {
  const c = String(context || "").trim().toLowerCase();

  if (c === "finance") return buildDynamicFinanceQuestions(signals);
  if (c === "ar") return buildDynamicArQuestions(signals);
  if (c === "maintenance") return buildDynamicMaintenanceQuestions(signals);
  if (c === "inventory") return buildDynamicInventoryQuestions(signals);

  return [
    ...buildDynamicFinanceQuestions(signals),
    ...buildDynamicArQuestions(signals),
    ...buildDynamicMaintenanceQuestions(signals),
    ...buildDynamicInventoryQuestions(signals),
  ];
}

function getSuggestedQuestions({ user, context = null, signals = {} }) {
  const base = questionsByRole(user?.role, context);
  const dynamic = getDynamicQuestions({ context, signals });

  return uniqueQuestions([
    ...dynamic,
    ...base,
  ]).slice(0, 12);
}

module.exports = {
  getSuggestedQuestions,
};