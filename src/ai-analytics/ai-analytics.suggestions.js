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

function financeQuestions() {
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

function arQuestions() {
  return [
    "كم إجمالي مستحقات العملاء؟",
    "قيمة متأخرات العملاء كام؟",
    "من أعلى عميل مديونية؟",
    "اعرض أعلى 5 عملاء مديونية",
    "فلوسنا عند العملاء كام؟",
  ];
}

function maintenanceQuestions() {
  return [
    "كم عدد أوامر العمل المفتوحة؟",
    "ما أعلى مركبة تكلفة صيانة؟",
    "اعرض أعلى 5 مركبات تكلفة صيانة",
  ];
}

function inventoryQuestions() {
  return [
    "ما أكثر قطع الغيار صرفًا هذا الشهر؟",
    "اعرض أعلى 5 أصناف صرفًا",
    "ما الأصناف القريبة من النفاد؟",
    "كام عدد الأصناف منخفضة المخزون؟",
  ];
}

function tripsQuestions() {
  return [
    "كم عدد الرحلات هذا الشهر؟",
    "اعرض الرحلات النشطة",
    "كم عدد الرحلات التي تحتاج إغلاق مالي؟",
    "من أعلى عميل من حيث الرحلات؟",
    "اعرض أعلى 5 عملاء حسب الرحلات",
    "من أعلى موقع من حيث الرحلات؟",
    "اعرض أعلى 5 مواقع حسب الرحلات",
    "من أعلى مركبة من حيث الرحلات؟",
    "اعرض أعلى 5 مركبات حسب الرحلات",
  ];
}

function defaultQuestions() {
  return [
    "كم إجمالي المصروفات هذا الشهر؟",
    "من أعلى عميل مديونية؟",
    "كم عدد أوامر العمل المفتوحة؟",
    "ما الأصناف القريبة من النفاد؟",
    "كم عدد الرحلات هذا الشهر؟",
  ];
}

function allQuestions() {
  return [
    ...financeQuestions(),
    ...arQuestions(),
    ...maintenanceQuestions(),
    ...inventoryQuestions(),
    ...tripsQuestions(),
  ];
}

function questionsByContext(context) {
  const c = String(context || "").trim().toLowerCase();

  const contextMap = {
    finance: financeQuestions,
    ar: arQuestions,
    maintenance: maintenanceQuestions,
    inventory: inventoryQuestions,
    trips: tripsQuestions,
  };

  return contextMap[c] ? contextMap[c]() : allQuestions();
}

function fieldSupervisorQuestions() {
  return [
    "كم إجمالي المصروفات هذا الشهر؟",
    "ما أعلى مركبة صرفًا هذا الشهر؟",
    "اعرض أعلى 5 مركبات صرفًا هذا الشهر",
    "كم عدد أوامر العمل المفتوحة؟",
    "ما أعلى مركبة تكلفة صيانة؟",
    "اعرض أعلى 5 مركبات تكلفة صيانة",
    "كم عدد الرحلات هذا الشهر؟",
    "اعرض الرحلات النشطة",
    "كم عدد الرحلات التي تحتاج إغلاق مالي؟",
    "من أعلى مركبة من حيث الرحلات؟",
  ];
}

function hrQuestions() {
  return [
    ...maintenanceQuestions(),
    ...tripsQuestions(),
  ];
}

function questionsByRole(role, context) {
  const r = roleUpper(role);
  const c = String(context || "").trim().toLowerCase();

  if (c) {
    return questionsByContext(c);
  }

  const roleMap = {
    ADMIN: allQuestions,
    ACCOUNTANT: () => [
      ...financeQuestions(),
      ...arQuestions(),
      ...tripsQuestions(),
    ],
    FIELD_SUPERVISOR: fieldSupervisorQuestions,
    STOREKEEPER: inventoryQuestions,
    HR: hrQuestions,
  };

  return roleMap[r] ? roleMap[r]() : defaultQuestions();
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

function buildDynamicTripsQuestions(signals = {}) {
  const items = [];

  const totalTrips = Number(signals.totalTrips || 0);
  const activeTrips = Number(signals.activeTrips || 0);
  const needFinancialClosure = Number(signals.needFinancialClosure || 0);
  const topClientTrips = Number(signals.topClientTrips || 0);
  const topVehicleTrips = Number(signals.topVehicleTrips || 0);

  if (totalTrips > 0) {
    items.push("كم عدد الرحلات هذا الشهر؟");
  }

  if (activeTrips > 0) {
    items.push("اعرض الرحلات النشطة");
  }

  if (needFinancialClosure > 0) {
    items.push("كم عدد الرحلات التي تحتاج إغلاق مالي؟");
  }

  if (topClientTrips > 0) {
    items.push("من أعلى عميل من حيث الرحلات؟");
    items.push("اعرض أعلى 5 عملاء حسب الرحلات");
  }

  if (topVehicleTrips > 0) {
    items.push("من أعلى مركبة من حيث الرحلات؟");
    items.push("اعرض أعلى 5 مركبات حسب الرحلات");
  }

  return items;
}

function dynamicQuestionsMap() {
  return {
    finance: buildDynamicFinanceQuestions,
    ar: buildDynamicArQuestions,
    maintenance: buildDynamicMaintenanceQuestions,
    inventory: buildDynamicInventoryQuestions,
    trips: buildDynamicTripsQuestions,
  };
}

function getDynamicQuestions({ context = null, signals = {} }) {
  const c = String(context || "").trim().toLowerCase();
  const map = dynamicQuestionsMap();

  if (map[c]) {
    return map[c](signals);
  }

  return [
    ...buildDynamicFinanceQuestions(signals),
    ...buildDynamicArQuestions(signals),
    ...buildDynamicMaintenanceQuestions(signals),
    ...buildDynamicInventoryQuestions(signals),
    ...buildDynamicTripsQuestions(signals),
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