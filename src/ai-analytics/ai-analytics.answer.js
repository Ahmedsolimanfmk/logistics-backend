function money(n) {
  return new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

function buildArabicAnswer({ question, interpreted, result }) {
  const intent = interpreted?.intent;

  if (intent === "expense_summary") {
    return `إجمالي المصروفات خلال ${labelRange(interpreted.range)} هو ${money(
      result?.data?.total_expense
    )} جنيه مصري.`;
  }

  if (intent === "expense_by_type") {
    const items = result?.data?.items || [];
    if (!items.length) {
      return `لا توجد بيانات مصروفات حسب النوع خلال ${labelRange(interpreted.range)}.`;
    }

    const top = items[0];
    return `أعلى نوع مصروف خلال ${labelRange(interpreted.range)} هو "${
      top.expense_type
    }" بإجمالي ${money(top.total_amount)} جنيه.`;
  }

  if (intent === "outstanding_summary") {
    return `إجمالي مستحقات العملاء خلال ${labelRange(
      interpreted.range
    )} هو ${money(result?.data?.total_outstanding)} جنيه، منها ${money(
      result?.data?.overdue_amount
    )} متأخرات.`;
  }

  if (intent === "top_debtors") {
    const items = result?.data?.items || [];
    if (!items.length) {
      return `لا توجد بيانات عملاء مديونية خلال ${labelRange(interpreted.range)}.`;
    }

    const top = items[0];
    return `أعلى عميل مديونية خلال ${labelRange(interpreted.range)} هو "${
      top.client_name
    }" بإجمالي ${money(top.total_outstanding)} جنيه.`;
  }

  if (intent === "open_work_orders") {
    return `عدد أوامر العمل المفتوحة خلال ${labelRange(
      interpreted.range
    )} هو ${Number(result?.data?.total_open_work_orders || 0)}.`;
  }

  return "لم أتمكن من فهم السؤال بشكل كافٍ في النسخة الحالية.";
}

function labelRange(range) {
  if (range === "today") return "اليوم";
  if (range === "this_month") return "هذا الشهر";
  if (range === "last_month") return "الشهر الماضي";
  if (range === "last_30_days") return "آخر 30 يوم";
  return "الفترة المطلوبة";
}

module.exports = {
  buildArabicAnswer,
};