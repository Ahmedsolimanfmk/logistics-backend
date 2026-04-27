const router = require("express").Router();
const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");
const { isAdminOrAccountant } = require("../auth/access");

const tripsController = require("./trips.controller");
const cashController = require("../cash/cash.controller");
const {
  requireTripStartFinishPermission,
} = require("./trip-permissions.middleware");

function mustBeFn(name, fn) {
  if (typeof fn !== "function") {
    throw new TypeError(
      `[trips.routes] Handler "${name}" is not a function. Check exports.`
    );
  }
  return fn;
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function requireUuidParam(paramName = "id") {
  return (req, res, next) => {
    const v = req.params?.[paramName];
    if (!isUuid(v)) return res.status(400).json({ message: "Invalid trip id" });
    return next();
  };
}

function requireAdminOrAccountant(req, res, next) {
  if (!isAdminOrAccountant(req)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
}

const createTrip = mustBeFn("createTrip", tripsController.createTrip);
const getTrips = mustBeFn("getTrips", tripsController.getTrips);
const getTripById = mustBeFn("getTripById", tripsController.getTripById);
const getTripFinanceSummary = mustBeFn(
  "getTripFinanceSummary",
  tripsController.getTripFinanceSummary
);
const autoPriceTrip = mustBeFn("autoPriceTrip", tripsController.autoPriceTrip);

const assignTrip = mustBeFn("assignTrip", tripsController.assignTrip);
const startTrip = mustBeFn("startTrip", tripsController.startTrip);
const finishTrip = mustBeFn("finishTrip", tripsController.finishTrip);

const openTripFinanceReview = mustBeFn(
  "openTripFinanceReview",
  cashController.openTripFinanceReview
);
const closeTripFinance = mustBeFn(
  "closeTripFinance",
  cashController.closeTripFinance
);

router.use(authRequired);
router.use(requireCompany);

// List / Create
router.get("/", getTrips);
router.post("/", createTrip);

// Finance routes BEFORE /:id
router.get("/:id/finance/summary", requireUuidParam("id"), getTripFinanceSummary);
router.post("/:id/auto-price", requireUuidParam("id"), autoPriceTrip);

router.post(
  "/:id/finance/open-review",
  requireUuidParam("id"),
  requireAdminOrAccountant,
  openTripFinanceReview
);

router.post(
  "/:id/finance/close",
  requireUuidParam("id"),
  requireAdminOrAccountant,
  closeTripFinance
);

// Assign / Start / Finish BEFORE /:id
router.post("/:id/assign", requireUuidParam("id"), assignTrip);

router.post(
  "/:id/start",
  requireUuidParam("id"),
  requireTripStartFinishPermission,
  startTrip
);

router.post(
  "/:id/finish",
  requireUuidParam("id"),
  requireTripStartFinishPermission,
  finishTrip
);

// Details LAST
router.get("/:id", requireUuidParam("id"), getTripById);

module.exports = router;