function labelRange(range) {
  const r = String(range || "").trim().toLowerCase();

  if (r === "today") return "اليوم";
  if (r === "this_week") return "هذا الأسبوع";
  if (r === "last_week") return "الأسبوع الماضي";
  if (r === "this_month") return "هذا الشهر";
  if (r === "last_month") return "الشهر الماضي";
  if (r === "this_year") return "هذه السنة";
  if (r === "last_year") return "السنة الماضية";
  if (r === "last_7_days") return "آخر 7 أيام";
  if (r === "last_30_days") return "آخر 30 يوم";
  if (r === "last_90_days") return "آخر 90 يوم";
  if (r === "compare_this_vs_last_month") return "هذا الشهر مقارنة بالشهر الماضي";
  if (r === "custom") return "الفترة المحددة";

  const dynamicLastDays = r.match(/^last_(\d+)_days$/);
  if (dynamicLastDays) {
    return `آخر ${Number(dynamicLastDays[1])} يوم`;
  }

  return "الفترة المطلوبة";
}

module.exports = {
  labelRange,
};