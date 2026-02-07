// =======================
// src/trips/trips.routes.js
// =======================

const router = require("express").Router();
const { authRequired } = require("../auth/jwt.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");

// IMPORTANT: ما تعملش destructuring مباشرة عشان لو اسم غلط يبقى undefined
const tripsController = require("./trips.controller");

// Guard helper: لو أي handler undefined هنطلع error واضح
function mustBeFn(name, fn) {
  if (typeof fn !== "function") {
    throw new TypeError(`[trips.routes] Handler "${name}" is not a function. Check exports in trips.controller.js`);
  }
  return fn;
}

// === Bind handlers safely ===
const createTrip = mustBeFn("createTrip", tripsController.createTrip);
const getTrips = mustBeFn("getTrips", tripsController.getTrips);
const getTripById = mustBeFn("getTripById", tripsController.getTripById);

const assignTrip = mustBeFn("assignTrip", tripsController.assignTrip);
const startTrip = mustBeFn("startTrip", tripsController.startTrip);
const finishTrip = mustBeFn("finishTrip", tripsController.finishTrip);
const { requireTripStartFinishPermission } = require("./trip-permissions.middleware");

// لو عندك endpoints مالية داخل trips.controller (اختياري)
// مثال: openTripFinanceReview / closeTripFinance / getTripFinanceSummary
const openTripFinanceReview = tripsController.openTripFinanceReview
  ? mustBeFn("openTripFinanceReview", tripsController.openTripFinanceReview)
  : null;

const closeTripFinance = tripsController.closeTripFinance
  ? mustBeFn("closeTripFinance", tripsController.closeTripFinance)
  : null;

const getTripFinanceSummary = tripsController.getTripFinanceSummary
  ? mustBeFn("getTripFinanceSummary", tripsController.getTripFinanceSummary)
  : null;

// =======================
// Routes
// =======================

// قائمة الرحلات / إنشاء رحلة
router.get("/", authRequired, getTrips);
router.post("/", authRequired, createTrip);
router.get("/:id", authRequired, getTripById);

// Assign / Start / Finish
router.post("/:id/assign", authRequired, assignTrip);
router.post("/:id/start", authRequired, requireTripStartFinishPermission, startTrip);
router.post("/:id/finish", authRequired, requireTripStartFinishPermission, finishTrip);

// Finance (لو موجودة في controller)
if (openTripFinanceReview) {
  router.post("/:id/finance/open-review", authRequired, requireAdminOrHR, openTripFinanceReview);
}
if (closeTripFinance) {
  router.post("/:id/finance/close", authRequired, requireAdminOrHR, closeTripFinance);
}
if (getTripFinanceSummary) {
  router.get("/:id/finance/summary", authRequired, getTripFinanceSummary);
}

module.exports = router;
