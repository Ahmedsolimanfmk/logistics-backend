// =======================
// src/trips/trips.routes.js
// =======================

const router = require("express").Router();
const { authRequired } = require("../auth/jwt.middleware");
const { isAdminOrAccountant } = require("../auth/access");

const tripsController = require("./trips.controller");
const cashController = require("../cash/cash.controller");
const { requireTripStartFinishPermission } = require("./trip-permissions.middleware");

// Guard helper
function mustBeFn(name, fn) {
  if (typeof fn !== "function") {
    throw new TypeError(`[trips.routes] Handler "${name}" is not a function. Check exports.`);
  }
  return fn;
}

// UUID validator
function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function requireUuidParam(paramName = "id") {
  return (req, res, next) => {
    const v = req.params?.[paramName];
    if (!isUuid(v)) return res.status(404).json({ message: "Not found" });
    return next();
  };
}

function requireAdminOrAccountant(req, res, next) {
  if (!isAdminOrAccountant(req)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
}

// === Bind handlers safely ===
const createTrip = mustBeFn("createTrip", tripsController.createTrip);
const getTrips = mustBeFn("getTrips", tripsController.getTrips);
const getTripById = mustBeFn("getTripById", tripsController.getTripById);
const getTripFinanceSummary = mustBeFn("getTripFinanceSummary", tripsController.getTripFinanceSummary);

const assignTrip = mustBeFn("assignTrip", tripsController.assignTrip);
const startTrip = mustBeFn("startTrip", tripsController.startTrip);
const finishTrip = mustBeFn("finishTrip", tripsController.finishTrip);

// finance state handlers
const openTripFinanceReview = mustBeFn("openTripFinanceReview", cashController.openTripFinanceReview);
const closeTripFinance = mustBeFn("closeTripFinance", cashController.closeTripFinance);

// =======================
// Routes (JWT required)
// =======================
router.use(authRequired);

// List / Create / Details
router.get("/", getTrips);
router.post("/", createTrip);
router.get("/:id", requireUuidParam("id"), getTripById);

// Finance
router.get("/:id/finance/summary", requireUuidParam("id"), getTripFinanceSummary);
router.post("/:id/finance/open-review", requireUuidParam("id"), requireAdminOrAccountant, openTripFinanceReview);
router.post("/:id/finance/close", requireUuidParam("id"), requireAdminOrAccountant, closeTripFinance);

// Assign / Start / Finish
router.post("/:id/assign", requireUuidParam("id"), assignTrip);
router.post("/:id/start", requireUuidParam("id"), requireTripStartFinishPermission, startTrip);
router.post("/:id/finish", requireUuidParam("id"), requireTripStartFinishPermission, finishTrip);

module.exports = router;