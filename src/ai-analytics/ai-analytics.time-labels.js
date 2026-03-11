function labelRange(range) {
  if (range === "today") return "اليوم";
  if (range === "this_week") return "هذا الأسبوع";
  if (range === "last_week") return "الأسبوع الماضي";
  if (range === "this_month") return "هذا الشهر";
  if (range === "last_month") return "الشهر الماضي";
  if (range === "last_30_days") return "آخر 30 يوم";
  if (range === "compare_this_vs_last_month") return "هذا الشهر مقارنة بالشهر الماضي";
  return "الفترة المطلوبة";
}

module.exports = {
  labelRange,
};