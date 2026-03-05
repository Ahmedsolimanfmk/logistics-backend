// =======================
// src/trips/trips.routes.js
// =======================

const router = require("express").Router();
const { authRequired } = require("../auth/jwt.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");

const tripsController = require("./trips.controller");
const { requireTripStartFinishPermission } = require("./trip-permissions.middleware");

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

// Optional finance handlers
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
// Routes (JWT required)
// =======================
router.use(authRequired);

// List / Create / Details
router.get("/", getTrips);
router.post("/", createTrip);
router.get("/:id", getTripById);

// Assign / Start / Finish
router.post("/:id/assign", assignTrip);
router.post("/:id/start", requireTripStartFinishPermission, startTrip);
router.post("/:id/finish", requireTripStartFinishPermission, finishTrip);

// Finance (لو موجودة)
if (openTripFinanceReview) {
  router.post("/:id/finance/open-review", requireAdminOrHR, openTripFinanceReview);
}
if (closeTripFinance) {
  router.post("/:id/finance/close", requireAdminOrHR, closeTripFinance);
}
if (getTripFinanceSummary) {
  router.get("/:id/finance/summary", getTripFinanceSummary);
}

module.exports = router;