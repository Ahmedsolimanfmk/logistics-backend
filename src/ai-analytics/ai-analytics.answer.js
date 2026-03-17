const { labelRange } = require("./ai-analytics.time-labels");

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

function renderTopList(items, getLabel, getValue, unit = "جنيه") {
  return items
    .map((item, idx) => {
      const label = getLabel(item) || "غير محدد";
      const value = getValue(item);
      return `${idx + 1}) ${label} — ${
        unit === "عدد" ? Number(value || 0) : `${money(value)} ${unit}`
      }`;
    })
    .join("\n");
}

function renderEntityLabel(item) {
  if (!item || typeof item !== "object") return "العنصر المطلوب";

  return (
    item.client_name ||
    item.site_name ||
    item.vehicle_name ||
    item.display_name ||
    item.part_name ||
    item.item_name ||
    item.expense_type ||
    item.type_name ||
    item.vendor_name ||
    item.payment_source ||
    item.approval_status ||
    item.plate_no ||
    item.fleet_no ||
    item.name ||
    "العنصر المطلوب"
  );
}

function paymentSourceLabel(v) {
  const s = String(v || "").toUpperCase();
  if (s === "ADVANCE") return "عهدة";
  if (s === "COMPANY") return "شركة";
  return v || "غير محدد";
}

function approvalStatusLabel(v) {
  const s = String(v || "").toUpperCase();
  if (s === "APPROVED") return "معتمد";
  if (s === "PENDING") return "معلق";
  if (s === "REJECTED") return "مرفوض";
  return v || "غير محدد";
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
    return `إجمالي المصروفات في هذا الشهر يساوي الشهر الماضي، والقيمة هي ${money(
      current
    )} جنيه.`;
  }

  if (diff > 0) {
    return `إجمالي المصروفات هذا الشهر هو ${money(current)} جنيه مقابل ${money(
      last
    )} جنيه في الشهر الماضي، بزيادة قدرها ${money(absDiff)} جنيه.`;
  }

  return `إجمالي المصروفات هذا الشهر هو ${money(current)} جنيه مقابل ${money(
    last
  )} جنيه في الشهر الماضي، بانخفاض قدره ${money(absDiff)} جنيه.`;
}

function buildActionAnswer({ parsed, execution }) {
  const intent = parsed?.intent;

  if (execution?.ok && execution?.executed) {
    if (intent === "create_work_order") {
      const woId = execution?.data?.work_order?.id || "غير معروف";
      const vehicleName =
        execution?.data?.vehicle?.display_name ||
        execution?.data?.vehicle?.fleet_no ||
        execution?.data?.vehicle?.plate_no ||
        "المركبة المحددة";

      return `تم إنشاء أمر العمل بنجاح للمركبة "${vehicleName}". رقم أمر العمل: ${woId}.`;
    }

    if (intent === "create_maintenance_request") {
      const requestId = execution?.data?.request?.id || "غير معروف";
      const vehicleName =
        execution?.data?.vehicle?.display_name ||
        execution?.data?.vehicle?.fleet_no ||
        execution?.data?.vehicle?.plate_no ||
        "المركبة المحددة";

      return `تم إنشاء طلب الصيانة بنجاح للمركبة "${vehicleName}". رقم الطلب: ${requestId}.`;
    }

    if (intent === "create_expense") {
      const expenseId = execution?.data?.expense?.id || "غير معروف";
      const amount = execution?.data?.expense?.amount || 0;
      const expenseType = execution?.data?.expense?.expense_type || "مصروف";

      return `تم تسجيل المصروف "${expenseType}" بنجاح بقيمة ${money(
        amount
      )} جنيه. رقم المصروف: ${expenseId}.`;
    }

    return "تم تنفيذ الأمر بنجاح.";
  }

  return execution?.message || "تعذر تنفيذ الأمر المطلوب.";
}

function buildReferenceFollowupAnswer({ parsed, result }) {
  const items = pickItems(result);
  const item = items[0] || null;

  if (!item) {
    return "لم أتمكن من تحديد العنصر المقصود من النتائج السابقة.";
  }

  if (parsed?.intent === "reference_previous_item") {
    return `تم تحديد العنصر المقصود من النتائج السابقة: "${renderEntityLabel(item)}".`;
  }

  if (parsed?.intent === "reference_previous_entity") {
    return `تم استخدام نفس الكيان السابق: "${renderEntityLabel(item)}".`;
  }

  if (parsed?.intent === "reference_previous_expand_limit") {
    return `تم توسيع النتائج السابقة وعرض ${items.length} عنصر.`;
  }

  return `تم الرجوع إلى النتائج السابقة وتحديد: "${renderEntityLabel(item)}".`;
}

function buildUiMeta({ parsed, result, answer }) {
  const intent = parsed?.intent;
  const range = parsed?.filters?.range;
  const limit = parsed?.options?.limit || 1;

  let title = "TREX AI Response";
  const badges = [];

  if (parsed?.module === "finance") badges.push("المالية");
  if (parsed?.module === "ar") badges.push("حسابات العملاء");
  if (parsed?.module === "maintenance") badges.push("الصيانة");
  if (parsed?.module === "inventory") badges.push("المخازن");
  if (parsed?.module === "trips") badges.push("الرحلات");

  if (parsed?.entities?.client_hint) badges.push(`عميل: ${parsed.entities.client_hint}`);
  if (parsed?.entities?.site_hint) badges.push(`موقع: ${parsed.entities.site_hint}`);
  if (parsed?.entities?.vehicle_hint) badges.push(`مركبة: ${parsed.entities.vehicle_hint}`);

  if (parsed?.mode === "reference_followup") badges.push("متابعة");
  if (range) badges.push(labelRange(range));
  if (limit > 1) badges.push(`Top ${limit}`);

  if (intent === "expense_summary") title = "إجمالي المصروفات";
  else if (intent === "expense_summary_compare") title = "مقارنة المصروفات";
  else if (intent === "expense_by_type") title = limit > 1 ? "أعلى أنواع المصروف" : "أعلى نوع مصروف";
  else if (intent === "expense_by_vehicle") title = limit > 1 ? "أعلى المركبات صرفًا" : "أعلى مركبة صرفًا";
  else if (intent === "expense_by_payment_source") title = "المصروفات حسب مصدر الدفع";
  else if (intent === "top_vendors") title = limit > 1 ? "أعلى الموردين مصروفات" : "أعلى مورد مصروفات";
  else if (intent === "expense_approval_breakdown") title = "حالات اعتماد المصروفات";
  else if (intent === "outstanding_summary") title = "مستحقات العملاء";
  else if (intent === "top_debtors") title = limit > 1 ? "أعلى العملاء مديونية" : "أعلى عميل مديونية";
  else if (intent === "open_work_orders") title = "أوامر العمل المفتوحة";
  else if (intent === "maintenance_cost_by_vehicle") title = limit > 1 ? "أعلى المركبات تكلفة صيانة" : "أعلى مركبة تكلفة صيانة";
  else if (intent === "top_issued_parts") title = limit > 1 ? "أكثر الأصناف صرفًا" : "أكثر صنف صرفًا";
  else if (intent === "low_stock_items") title = "الأصناف منخفضة المخزون";
  else if (intent === "trips_summary") title = "ملخص الرحلات";
  else if (intent === "active_trips") title = limit > 1 ? "الرحلات النشطة" : "الرحلة النشطة";
  else if (intent === "trips_need_financial_closure") title = "رحلات تحتاج إغلاق مالي";
  else if (intent === "top_clients_by_trips") title = limit > 1 ? "أعلى العملاء حسب الرحلات" : "أعلى عميل حسب الرحلات";
  else if (intent === "top_sites_by_trips") title = limit > 1 ? "أعلى المواقع حسب الرحلات" : "أعلى موقع حسب الرحلات";
  else if (intent === "top_vehicles_by_trips") title = limit > 1 ? "أعلى المركبات حسب الرحلات" : "أعلى مركبة حسب الرحلات";
  else if (intent === "create_work_order") title = "إنشاء أمر عمل";
  else if (intent === "create_maintenance_request") title = "إنشاء طلب صيانة";
  else if (intent === "create_expense") title = "تسجيل مصروف";
  else if (intent === "reference_previous_item") title = "عنصر من النتائج السابقة";
  else if (intent === "reference_previous_entity") title = "نفس الكيان السابق";
  else if (intent === "reference_previous_expand_limit") title = "توسيع النتائج السابقة";

  return {
    mode: parsed?.mode || "unknown",
    title,
    summary: answer,
    badges,
    result_type: parsed?.options?.response_type || "summary",
    has_items: pickItems(result).length > 0,
  };
}

function buildArabicAnswer({ parsed, result, execution = null }) {
  const intent = parsed?.intent;
  const limit = parsed?.options?.limit || 1;
  const focus = parsed?.filters?.focus;

  if (parsed?.mode === "action") {
    const answer = buildActionAnswer({ parsed, execution });
    return {
      answer,
      ui: buildUiMeta({ parsed, result: execution, answer }),
    };
  }

  if (parsed?.mode === "reference_followup") {
    const answer = buildReferenceFollowupAnswer({ parsed, result });
    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "expense_summary_compare") {
    const answer = buildExpenseCompareAnswer(result);
    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "expense_summary") {
    const totalExpense = pickValue(result, [
      ["data", "total_expense"],
      ["total_expense"],
      ["data", "total"],
      ["total"],
    ]);

    let answer = `إجمالي المصروفات خلال ${labelRange(
      parsed?.filters?.range
    )} هو ${money(totalExpense)} جنيه مصري.`;

    if (parsed?.entities?.vehicle_hint) {
      answer = `إجمالي مصروفات المركبة "${parsed.entities.vehicle_hint}" خلال ${labelRange(
        parsed?.filters?.range
      )} هو ${money(totalExpense)} جنيه مصري.`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "expense_by_type") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      answer = `لا توجد بيانات مصروفات حسب النوع خلال ${labelRange(
        parsed?.filters?.range
      )}.`;
    } else if (limit > 1) {
      answer = `أعلى ${Math.min(limit, items.length)} أنواع مصروف خلال ${labelRange(
        parsed?.filters?.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.expense_type || x.type_name || x.name,
        (x) => x.total_amount || x.amount || 0
      )}`;
    } else {
      const top = items[0];
      answer = `أعلى نوع مصروف خلال ${labelRange(
        parsed?.filters?.range
      )} هو "${top.expense_type || top.type_name || top.name || "غير محدد"}" بإجمالي ${money(
        top.total_amount || top.amount || 0
      )} جنيه.`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "expense_by_vehicle") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      answer = `لا توجد بيانات مصروفات حسب المركبة خلال ${labelRange(
        parsed?.filters?.range
      )}.`;
    } else if (limit > 1) {
      answer = `أعلى ${Math.min(limit, items.length)} مركبات من حيث المصروفات خلال ${labelRange(
        parsed?.filters?.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.display_name || x.fleet_no || x.plate_no || "مركبة غير معروفة",
        (x) => x.total_amount || x.amount || 0
      )}`;
    } else {
      const top = items[0];
      answer = `أعلى مركبة من حيث المصروفات خلال ${labelRange(
        parsed?.filters?.range
      )} هي "${
        top.display_name || top.fleet_no || top.plate_no || "غير محددة"
      }" بإجمالي ${money(top.total_amount || top.amount || 0)} جنيه.`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "expense_by_payment_source") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      answer = `لا توجد بيانات مصروفات حسب مصدر الدفع خلال ${labelRange(
        parsed?.filters?.range
      )}.`;
    } else {
      answer = `توزيع المصروفات حسب مصدر الدفع خلال ${labelRange(
        parsed?.filters?.range
      )}:\n${renderTopList(
        items,
        (x) => paymentSourceLabel(x.payment_source),
        (x) => x.total_amount || 0
      )}`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "top_vendors") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      answer = `لا توجد بيانات موردين خلال ${labelRange(parsed?.filters?.range)}.`;
    } else if (limit > 1) {
      answer = `أعلى ${Math.min(limit, items.length)} موردين من حيث المصروفات خلال ${labelRange(
        parsed?.filters?.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.vendor_name || "مورد غير معروف",
        (x) => x.total_amount || 0
      )}`;
    } else {
      const top = items[0];
      answer = `أعلى مورد من حيث المصروفات خلال ${labelRange(
        parsed?.filters?.range
      )} هو "${top.vendor_name || "مورد غير معروف"}" بإجمالي ${money(
        top.total_amount || 0
      )} جنيه.`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "expense_approval_breakdown") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      answer = `لا توجد بيانات لحالات اعتماد المصروفات خلال ${labelRange(
        parsed?.filters?.range
      )}.`;
    } else {
      answer = `توزيع المصروفات حسب حالة الاعتماد خلال ${labelRange(
        parsed?.filters?.range
      )}:\n${renderTopList(
        items,
        (x) => approvalStatusLabel(x.approval_status),
        (x) => x.total_amount || 0
      )}`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
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

    let answer = "";
    if (focus === "overdue_only") {
      answer = `قيمة متأخرات العملاء خلال ${labelRange(
        parsed?.filters?.range
      )} هي ${money(overdueAmount)} جنيه.`;
    } else {
      answer = `إجمالي مستحقات العملاء خلال ${labelRange(
        parsed?.filters?.range
      )} هو ${money(totalOutstanding)} جنيه، منها ${money(overdueAmount)} متأخرات.`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "top_debtors") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      answer = `لا توجد بيانات عملاء مديونية خلال ${labelRange(
        parsed?.filters?.range
      )}.`;
    } else if (limit > 1) {
      answer = `أعلى ${Math.min(limit, items.length)} عملاء مديونية خلال ${labelRange(
        parsed?.filters?.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.client_name || x.name,
        (x) => x.total_outstanding || x.amount || 0
      )}`;
    } else {
      const top = items[0];
      answer = `أعلى عميل مديونية خلال ${labelRange(
        parsed?.filters?.range
      )} هو "${top.client_name || top.name || "غير محدد"}" بإجمالي ${money(
        top.total_outstanding || top.amount || 0
      )} جنيه.`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
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

    const answer = `عدد أوامر العمل المفتوحة خلال ${labelRange(
      parsed?.filters?.range
    )} هو ${Number(totalOpen || 0)}.`;

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "maintenance_cost_by_vehicle") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      answer = `لا توجد بيانات تكلفة صيانة للمركبات خلال ${labelRange(
        parsed?.filters?.range
      )}.`;
    } else if (limit > 1) {
      answer = `أعلى ${Math.min(limit, items.length)} مركبات من حيث تكلفة الصيانة خلال ${labelRange(
        parsed?.filters?.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.vehicle_name || x.display_name || x.plate_no || x.name,
        (x) => x.total_cost || x.total_amount || x.amount || 0
      )}`;
    } else {
      const top = items[0];
      answer = `أعلى مركبة من حيث تكلفة الصيانة خلال ${labelRange(
        parsed?.filters?.range
      )} هي "${
        top.vehicle_name || top.display_name || top.plate_no || top.name || "غير محددة"
      }" بإجمالي ${money(top.total_cost || top.total_amount || top.amount || 0)} جنيه.`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "top_issued_parts") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      answer = `لا توجد بيانات صرف أصناف خلال ${labelRange(parsed?.filters?.range)}.`;
    } else if (limit > 1) {
      answer = `أكثر ${Math.min(limit, items.length)} أصناف صرفًا خلال ${labelRange(
        parsed?.filters?.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.part_name || x.item_name || x.name,
        (x) => x.total_issued_qty || x.issued_qty || x.qty || 0,
        "عدد"
      )}`;
    } else {
      const top = items[0];
      answer = `أكثر صنف تم صرفه خلال ${labelRange(parsed?.filters?.range)} هو "${
        top.part_name || top.item_name || top.name || "غير محدد"
      }" بعدد ${Number(top.total_issued_qty || top.issued_qty || top.qty || 0)}.`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "low_stock_items") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      answer = "لا توجد أصناف منخفضة المخزون حاليًا.";
    } else if (focus === "count_only") {
      answer = `عدد الأصناف منخفضة المخزون حاليًا هو ${items.length}.`;
    } else {
      const top = items[0];
      answer = `يوجد ${items.length} أصناف منخفضة المخزون حاليًا. أقربها للنفاد هو "${
        top.part_name || top.item_name || top.name || "غير محدد"
      }".`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "trips_summary") {
    const totalTrips = pickValue(result, [
      ["data", "total_trips"],
      ["total_trips"],
      ["data", "count"],
      ["count"],
      ["data", "total"],
      ["total"],
    ]);

    const activeCount = pickValue(result, [
      ["data", "active_count"],
      ["active_count"],
    ]);

    const completedCount = pickValue(result, [
      ["data", "completed_count"],
      ["completed_count"],
    ]);

    let answer = `إجمالي الرحلات خلال ${labelRange(
      parsed?.filters?.range
    )} هو ${Number(totalTrips || 0)} رحلة، منها ${Number(activeCount || 0)} نشطة و${Number(
      completedCount || 0
    )} مكتملة.`;

    if (parsed?.entities?.client_hint) {
      answer = `إجمالي رحلات العميل "${parsed.entities.client_hint}" خلال ${labelRange(
        parsed?.filters?.range
      )} هو ${Number(totalTrips || 0)} رحلة، منها ${Number(activeCount || 0)} نشطة و${Number(
        completedCount || 0
      )} مكتملة.`;
    } else if (parsed?.entities?.site_hint) {
      answer = `إجمالي رحلات الموقع "${parsed.entities.site_hint}" خلال ${labelRange(
        parsed?.filters?.range
      )} هو ${Number(totalTrips || 0)} رحلة، منها ${Number(activeCount || 0)} نشطة و${Number(
        completedCount || 0
      )} مكتملة.`;
    } else if (parsed?.entities?.vehicle_hint) {
      answer = `إجمالي رحلات المركبة "${parsed.entities.vehicle_hint}" خلال ${labelRange(
        parsed?.filters?.range
      )} هو ${Number(totalTrips || 0)} رحلة، منها ${Number(activeCount || 0)} نشطة و${Number(
        completedCount || 0
      )} مكتملة.`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "active_trips") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      if (parsed?.entities?.client_hint) {
        answer = `لا توجد رحلات نشطة للعميل "${parsed.entities.client_hint}" خلال ${labelRange(
          parsed?.filters?.range
        )}.`;
      } else if (parsed?.entities?.site_hint) {
        answer = `لا توجد رحلات نشطة للموقع "${parsed.entities.site_hint}" خلال ${labelRange(
          parsed?.filters?.range
        )}.`;
      } else if (parsed?.entities?.vehicle_hint) {
        answer = `لا توجد رحلات نشطة للمركبة "${parsed.entities.vehicle_hint}" خلال ${labelRange(
          parsed?.filters?.range
        )}.`;
      } else {
        answer = `لا توجد رحلات نشطة خلال ${labelRange(parsed?.filters?.range)}.`;
      }
    } else if (limit > 1) {
      answer = `أول ${Math.min(limit, items.length)} رحلات نشطة خلال ${labelRange(
        parsed?.filters?.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => `${x.client_name || "عميل غير معروف"} — ${x.site_name || "موقع غير معروف"}`,
        () => 1,
        "عدد"
      )}`;
    } else {
      const top = items[0];
      answer = `هناك رحلة نشطة تخص العميل "${top.client_name || "عميل غير معروف"}" في "${
        top.site_name || "موقع غير معروف"
      }".`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "trips_need_financial_closure") {
    const items = pickItems(result);
    const totalNeed = pickValue(result, [
      ["data", "total_need_financial_closure"],
      ["total_need_financial_closure"],
      ["data", "count"],
      ["count"],
    ]);

    let answer = "";
    if (!items.length) {
      if (parsed?.entities?.client_hint) {
        answer = `لا توجد رحلات للعميل "${parsed.entities.client_hint}" تحتاج إغلاقًا ماليًا خلال ${labelRange(
          parsed?.filters?.range
        )}.`;
      } else if (parsed?.entities?.site_hint) {
        answer = `لا توجد رحلات للموقع "${parsed.entities.site_hint}" تحتاج إغلاقًا ماليًا خلال ${labelRange(
          parsed?.filters?.range
        )}.`;
      } else if (parsed?.entities?.vehicle_hint) {
        answer = `لا توجد رحلات للمركبة "${parsed.entities.vehicle_hint}" تحتاج إغلاقًا ماليًا خلال ${labelRange(
          parsed?.filters?.range
        )}.`;
      } else {
        answer = `لا توجد رحلات تحتاج إغلاقًا ماليًا خلال ${labelRange(parsed?.filters?.range)}.`;
      }
    } else {
      if (parsed?.entities?.client_hint) {
        answer = `يوجد ${Number(totalNeed || items.length)} رحلة للعميل "${parsed.entities.client_hint}" تحتاج إغلاقًا ماليًا خلال ${labelRange(
          parsed?.filters?.range
        )}.`;
      } else if (parsed?.entities?.site_hint) {
        answer = `يوجد ${Number(totalNeed || items.length)} رحلة للموقع "${parsed.entities.site_hint}" تحتاج إغلاقًا ماليًا خلال ${labelRange(
          parsed?.filters?.range
        )}.`;
      } else if (parsed?.entities?.vehicle_hint) {
        answer = `يوجد ${Number(totalNeed || items.length)} رحلة للمركبة "${parsed.entities.vehicle_hint}" تحتاج إغلاقًا ماليًا خلال ${labelRange(
          parsed?.filters?.range
        )}.`;
      } else {
        answer = `يوجد ${Number(totalNeed || items.length)} رحلة تحتاج إغلاقًا ماليًا خلال ${labelRange(
          parsed?.filters?.range
        )}.`;
      }
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "top_clients_by_trips") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      answer = `لا توجد بيانات عملاء للرحلات خلال ${labelRange(parsed?.filters?.range)}.`;
    } else if (limit > 1) {
      answer = `أعلى ${Math.min(limit, items.length)} عملاء من حيث عدد الرحلات خلال ${labelRange(
        parsed?.filters?.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.client_name || "عميل غير معروف",
        (x) => x.trips_count || 0,
        "عدد"
      )}`;
    } else {
      const top = items[0];
      answer = `أعلى عميل من حيث عدد الرحلات خلال ${labelRange(
        parsed?.filters?.range
      )} هو "${top.client_name || "عميل غير معروف"}" بعدد ${Number(top.trips_count || 0)} رحلة.`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "top_sites_by_trips") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      answer = `لا توجد بيانات مواقع للرحلات خلال ${labelRange(parsed?.filters?.range)}.`;
    } else if (limit > 1) {
      answer = `أعلى ${Math.min(limit, items.length)} مواقع من حيث عدد الرحلات خلال ${labelRange(
        parsed?.filters?.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.site_name || "موقع غير معروف",
        (x) => x.trips_count || 0,
        "عدد"
      )}`;
    } else {
      const top = items[0];
      answer = `أعلى موقع من حيث عدد الرحلات خلال ${labelRange(
        parsed?.filters?.range
      )} هو "${top.site_name || "موقع غير معروف"}" بعدد ${Number(top.trips_count || 0)} رحلة.`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  if (intent === "top_vehicles_by_trips") {
    const items = pickItems(result);

    let answer = "";
    if (!items.length) {
      answer = `لا توجد بيانات مركبات للرحلات خلال ${labelRange(parsed?.filters?.range)}.`;
    } else if (limit > 1) {
      answer = `أعلى ${Math.min(limit, items.length)} مركبات من حيث عدد الرحلات خلال ${labelRange(
        parsed?.filters?.range
      )}:\n${renderTopList(
        items.slice(0, limit),
        (x) => x.display_name || x.fleet_no || x.plate_no || "مركبة غير معروفة",
        (x) => x.trips_count || 0,
        "عدد"
      )}`;
    } else {
      const top = items[0];
      answer = `أعلى مركبة من حيث عدد الرحلات خلال ${labelRange(
        parsed?.filters?.range
      )} هي "${
        top.display_name || top.fleet_no || top.plate_no || "مركبة غير معروفة"
      }" بعدد ${Number(top.trips_count || 0)} رحلة.`;
    }

    return {
      answer,
      ui: buildUiMeta({ parsed, result, answer }),
    };
  }

  const answer = "لم أتمكن من فهم السؤال بشكل كافٍ في النسخة الحالية.";
  return {
    answer,
    ui: buildUiMeta({ parsed, result, answer }),
  };
}

module.exports = {
  buildArabicAnswer,
};