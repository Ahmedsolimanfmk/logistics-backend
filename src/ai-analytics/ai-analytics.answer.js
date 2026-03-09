function money(n) {
  return new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

function pickItems(result) {
  if (Array.isArray(result?.data?.items)) return result.data.items;
  if (Array.isArray(result?.items)) return result.items;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function pickValue(obj, paths = []) {
  for (const path of paths) {
    let cur = obj;
    let ok = true;

    for (const key of path) {
      if (cur == null || !(key in cur)) {
        ok = false;
        break;
      }
      cur = cur[key];
    }

    if (ok && cur != null) return cur;
  }

  return undefined;
}

function labelRange(range) {
  if (range === "today") return "اليوم";
  if (range === "this_month") return "هذا الشهر";
  if (range === "last_month") return "الشهر الماضي";
  if (range === "last_30_days") return "آخر 30 يوم";
  return "الفترة المطلوبة";
}

function renderTopList(items, getLabel, getValue, unit = "جنيه") {
  return items
    .map((item, idx) => {
      const label = getLabel(item) || "غير محدد";
      const value = getValue(item);
      return `${idx + 1}) ${label} — ${unit === "عدد" ? Number(value || 0) : `${money(value)} ${unit}`}`;
    })
    .join("\n");
}

function buildExpenseCompareAnswer(result) {
  const current = Number(result?.data?.this_month_total || 0);
  const last = Number(result?.data?.last_month_total || 0);
  const diff = current - last;
  const absDiff = Math.abs(diff);

  if (current === 0 && last === 0) {
    return "لا توجد مصروفات مسجلة في هذا الشهر أو الشهر الماضي.";
  }

  if (diff === 0) {
    return `إجمالي المصروفات في هذا الشهر يساوي الشهر الماضي، والقيمة هي ${money(current)} جنيه.`;
  }

  if (diff > 0) {
    return `إجمالي المصروفات هذا الشهر هو ${money(current)} جنيه مقابل ${money(last)} جنيه في الشهر الماضي، بزيادة قدرها ${money(absDiff)} جنيه.`;
  }

  return `إجمالي المصروفات هذا الشهر هو ${money(current)} جنيه مقابل ${money(last)} جنيه في الشهر الماضي، بانخفاض قدره ${money(absDiff)} جنيه.`;
}

function buildArabicAnswer({ interpreted, result }) {
  const intent = interpreted?.intent;
  const limit = interpreted?.limit || 1;
  const focus = interpreted?.focus;

  if (intent === "expense_summary_compare") {
    return buildExpenseCompareAnswer(result);
  }

  if (intent === "expense_summary") {
    const totalExpense = pickValue(result, [
      ["data", "total_expense"],
      ["total_expense"],
      ["data", "total"],
      ["total"],
    ]);

    return `إجمالي المصروفات خلال ${labelRange(interpreted.range)} هو ${money(
      totalExpense
    )} جنيه مصري.`;
  }

  if (intent === "expense_by_type") {
    const items = pickItems(result);

    if (!items.length) {
      return `لا توجد بيانات مصروفات حسب النوع خلال ${labelRange(interpreted.range)}.`;
    }

    if (limit > 1) {
      return `أعلى ${Math.min(limit, items.length)} أنواع مصروف خلال ${labelRange(
        interpreted.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.expense_type || x.type_name || x.name,
        (x) => x.total_amount || x.amount || 0
      )}`;
    }

    const top = items[0];
    return `أعلى نوع مصروف خلال ${labelRange(interpreted.range)} هو "${
      top.expense_type || top.type_name || top.name || "غير محدد"
    }" بإجمالي ${money(top.total_amount || top.amount || 0)} جنيه.`;
  }

  if (intent === "outstanding_summary") {
    const totalOutstanding = pickValue(result, [
      ["data", "total_outstanding"],
      ["total_outstanding"],
      ["data", "total"],
      ["total"],
    ]);

    const overdueAmount = pickValue(result, [
      ["data", "overdue_amount"],
      ["overdue_amount"],
    ]);

    if (focus === "overdue_only") {
      return `قيمة متأخرات العملاء خلال ${labelRange(
        interpreted.range
      )} هي ${money(overdueAmount)} جنيه.`;
    }

    return `إجمالي مستحقات العملاء خلال ${labelRange(
      interpreted.range
    )} هو ${money(totalOutstanding)} جنيه، منها ${money(
      overdueAmount
    )} متأخرات.`;
  }

  if (intent === "top_debtors") {
    const items = pickItems(result);

    if (!items.length) {
      return `لا توجد بيانات عملاء مديونية خلال ${labelRange(interpreted.range)}.`;
    }

    if (limit > 1) {
      return `أعلى ${Math.min(limit, items.length)} عملاء مديونية خلال ${labelRange(
        interpreted.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.client_name || x.name,
        (x) => x.total_outstanding || x.amount || 0
      )}`;
    }

    const top = items[0];
    return `أعلى عميل مديونية خلال ${labelRange(interpreted.range)} هو "${
      top.client_name || top.name || "غير محدد"
    }" بإجمالي ${money(top.total_outstanding || top.amount || 0)} جنيه.`;
  }

  if (intent === "open_work_orders") {
    const totalOpen = pickValue(result, [
      ["data", "total_open_work_orders"],
      ["total_open_work_orders"],
      ["data", "count"],
      ["count"],
      ["data", "total"],
      ["total"],
    ]);

    return `عدد أوامر العمل المفتوحة خلال ${labelRange(
      interpreted.range
    )} هو ${Number(totalOpen || 0)}.`;
  }

  if (intent === "maintenance_cost_by_vehicle") {
    const items = pickItems(result);

    if (!items.length) {
      return `لا توجد بيانات تكلفة صيانة للمركبات خلال ${labelRange(interpreted.range)}.`;
    }

    if (limit > 1) {
      return `أعلى ${Math.min(limit, items.length)} مركبات من حيث تكلفة الصيانة خلال ${labelRange(
        interpreted.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.vehicle_name || x.display_name || x.plate_no || x.name,
        (x) => x.total_cost || x.total_amount || x.amount || 0
      )}`;
    }

    const top = items[0];
    return `أعلى مركبة من حيث تكلفة الصيانة خلال ${labelRange(interpreted.range)} هي "${
      top.vehicle_name || top.display_name || top.plate_no || top.name || "غير محددة"
    }" بإجمالي ${money(top.total_cost || top.total_amount || top.amount || 0)} جنيه.`;
  }

  if (intent === "top_issued_parts") {
    const items = pickItems(result);

    if (!items.length) {
      return `لا توجد بيانات صرف أصناف خلال ${labelRange(interpreted.range)}.`;
    }

    if (limit > 1) {
      return `أكثر ${Math.min(limit, items.length)} أصناف صرفًا خلال ${labelRange(
        interpreted.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.part_name || x.item_name || x.name,
        (x) => x.total_issued_qty || x.issued_qty || x.qty || 0,
        "عدد"
      )}`;
    }

    const top = items[0];
    return `أكثر صنف تم صرفه خلال ${labelRange(interpreted.range)} هو "${
      top.part_name || top.item_name || top.name || "غير محدد"
    }" بعدد ${Number(top.total_issued_qty || top.issued_qty || top.qty || 0)}.`;
  }

  if (intent === "low_stock_items") {
    const items = pickItems(result);

    if (!items.length) {
      return "لا توجد أصناف منخفضة المخزون حاليًا.";
    }

    if (focus === "count_only") {
      return `عدد الأصناف منخفضة المخزون حاليًا هو ${items.length}.`;
    }

    const top = items[0];
    return `يوجد ${items.length} أصناف منخفضة المخزون حاليًا. أقربها للنفاد هو "${
      top.part_name || top.item_name || top.name || "غير محدد"
    }".`;
  }

  return "لم أتمكن من فهم السؤال بشكل كافٍ في النسخة الحالية.";
}

module.exports = {
  buildArabicAnswer,
};