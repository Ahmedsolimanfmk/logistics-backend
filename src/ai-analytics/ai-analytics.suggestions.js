function roleUpper(role) {
  return String(role || "").trim().toUpperCase();
}

function getSuggestedQuestions({ user, context = null }) {
  const role = roleUpper(user?.role);

  const financeQuestions = [
    "كم إجمالي المصروفات هذا الشهر؟",
    "ما أعلى نوع مصروف هذا الشهر؟",
    "ما إجمالي المصروفات الشهر الماضي؟",
  ];

  const arQuestions = [
    "ما إجمالي مستحقات العملاء؟",
    "من أعلى عميل مديونية؟",
    "من أعلى 5 عملاء مديونية؟",
  ];

  const maintenanceQuestions = [
    "كم عدد أوامر العمل المفتوحة؟",
    "ما أعلى المركبات تكلفة صيانة؟",
  ];

  const inventoryQuestions = [
    "ما أكثر قطع الغيار صرفاً؟",
    "ما أكثر 5 أصناف صرفاً؟",
    "ما الأصناف القريبة من النفاد؟",
  ];

  const byContext = {
    finance: financeQuestions,
    ar: arQuestions,
    maintenance: maintenanceQuestions,
    inventory: inventoryQuestions,
  };

  if (context && byContext[context]) {
    return byContext[context];
  }

  if (["ADMIN", "ACCOUNTANT"].includes(role)) {
    return [
      ...financeQuestions,
      ...arQuestions,
      ...maintenanceQuestions,
      ...inventoryQuestions,
    ].slice(0, 8);
  }

  if (["SUPERVISOR", "OPERATOR"].includes(role)) {
    return [...maintenanceQuestions, ...inventoryQuestions].slice(0, 6);
  }

  return [
    ...maintenanceQuestions,
    ...inventoryQuestions,
    "كم عدد أوامر العمل المفتوحة؟",
    "ما الأصناف القريبة من النفاد؟",
  ].slice(0, 6);
}

module.exports = {
  getSuggestedQuestions,
};