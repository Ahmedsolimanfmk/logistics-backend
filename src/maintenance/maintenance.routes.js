// =======================
// src/maintenance/maintenance.routes.js
// =======================

const express = require("express");
const router = express.Router();

// ✅ jwt.middleware عندك بيعمل: module.exports = { authRequired }
const jwtMod = require("../auth/jwt.middleware");
const authRequired =
  typeof jwtMod === "function"
    ? jwtMod
    : typeof jwtMod?.authRequired === "function"
    ? jwtMod.authRequired
    : null;

if (!authRequired) {
  console.error("❌ authRequired is not a function. Check ../auth/jwt.middleware export.");
}

// Controllers as modules (مش destructuring مباشرة)
const reqCtrl = require("./maintenance.requests.controller");
const invCtrl = require("./maintenance.inventory.controller");
const instCtrl = require("./maintenance.installations.controller");
const workCtrl = require("./maintenance.workorders.controller");
const vehCtrl = require("./maintenance.vehicles.controller");
const attCtrl = require("./maintenance.attachments.controller");

// helper: pick a handler function safely
function pick(mod, names) {
  if (!mod) return null;
  if (typeof mod === "function") return mod;
  for (const n of names) {
    if (typeof mod[n] === "function") return mod[n];
  }
  return null;
}

function fallback(name) {
  return (req, res) =>
    res.status(500).json({
      message: `Route handler missing: ${name}`,
      hint: "Check controller exports (module.exports).",
    });
}

// =======================
// Handlers wiring
// =======================

// ===== Requests =====
const createMaintenanceRequest =
  pick(reqCtrl, ["createMaintenanceRequest"]) || fallback("createMaintenanceRequest");

const listMaintenanceRequests =
  pick(reqCtrl, ["listMaintenanceRequests"]) || fallback("listMaintenanceRequests");

const getMaintenanceRequestById =
  pick(reqCtrl, ["getMaintenanceRequestById"]) || fallback("getMaintenanceRequestById");

const approveMaintenanceRequest =
  pick(reqCtrl, ["approveMaintenanceRequest"]) || fallback("approveMaintenanceRequest");

const rejectMaintenanceRequest =
  pick(reqCtrl, ["rejectMaintenanceRequest"]) || fallback("rejectMaintenanceRequest");

// ===== Inventory =====
const createIssueForWorkOrder =
  pick(invCtrl, ["createIssueForWorkOrder"]) || fallback("createIssueForWorkOrder");

const addIssueLines = pick(invCtrl, ["addIssueLines"]) || fallback("addIssueLines");

// ===== Installations =====
const addInstallations = pick(instCtrl, ["addInstallations"]) || fallback("addInstallations");

const listInstallations = pick(instCtrl, ["listInstallations"]) || fallback("listInstallations");

// ===== Work Orders =====
const completeWorkOrder = pick(workCtrl, ["completeWorkOrder"]) || fallback("completeWorkOrder");

const getWorkOrderReport = pick(workCtrl, ["getWorkOrderReport"]) || fallback("getWorkOrderReport");

const upsertPostReport = pick(workCtrl, ["upsertPostReport"]) || fallback("upsertPostReport");

// ===== Vehicles Options =====
const listVehicleOptions = pick(vehCtrl, ["listVehicleOptions"]) || fallback("listVehicleOptions");

// ===== Attachments =====
const listRequestAttachments =
  pick(attCtrl, ["listRequestAttachments"]) || fallback("listRequestAttachments");

const listWorkOrders = pick(workCtrl, ["listWorkOrders"]) || fallback("listWorkOrders");
const getWorkOrderById = pick(workCtrl, ["getWorkOrderById"]) || fallback("getWorkOrderById");

const uploadRequestAttachments =
  attCtrl && Array.isArray(attCtrl.uploadRequestAttachments)
    ? attCtrl.uploadRequestAttachments
    : fallback("uploadRequestAttachments");


const deleteAttachment = pick(attCtrl, ["deleteAttachment"]) || fallback("deleteAttachment");

// Debug prints
console.log("MAINT ROUTES WIRING:", {
  authRequired: typeof authRequired,

  // requests
  createMaintenanceRequest: typeof createMaintenanceRequest,
  listMaintenanceRequests: typeof listMaintenanceRequests,
  getMaintenanceRequestById: typeof getMaintenanceRequestById,
  approveMaintenanceRequest: typeof approveMaintenanceRequest,
  rejectMaintenanceRequest: typeof rejectMaintenanceRequest,

  // inventory
  createIssueForWorkOrder: typeof createIssueForWorkOrder,
  addIssueLines: typeof addIssueLines,

  // installations
  addInstallations: typeof addInstallations,
  listInstallations: typeof listInstallations,

  // work orders
  completeWorkOrder: typeof completeWorkOrder,
  getWorkOrderReport: typeof getWorkOrderReport,
  upsertPostReport: typeof upsertPostReport,

  // vehicles
  listVehicleOptions: typeof listVehicleOptions,

  // attachments
  listRequestAttachments: typeof listRequestAttachments,
  uploadRequestAttachments: typeof uploadRequestAttachments,
  deleteAttachment: typeof deleteAttachment,
});

// =======================
// Routes
// =======================

// Requests
router.post("/requests", authRequired || fallback("authRequired"), createMaintenanceRequest);
router.get("/requests", authRequired || fallback("authRequired"), listMaintenanceRequests);
router.get("/requests/:id", authRequired || fallback("authRequired"), getMaintenanceRequestById);

router.post(
  "/requests/:id/approve",
  authRequired || fallback("authRequired"),
  approveMaintenanceRequest
);

router.post(
  "/requests/:id/reject",
  authRequired || fallback("authRequired"),
  rejectMaintenanceRequest
);

// Attachments
router.get(
  "/requests/:id/attachments",
  authRequired || fallback("authRequired"),
  listRequestAttachments
);

// uploadRequestAttachments is an array [multerMiddleware, handler]
if (Array.isArray(uploadRequestAttachments)) {
  router.post(
    "/requests/:id/attachments",
    authRequired || fallback("authRequired"),
    ...uploadRequestAttachments
  );
} else {
  router.post(
    "/requests/:id/attachments",
    authRequired || fallback("authRequired"),
    uploadRequestAttachments
  );
}

router.delete(
  "/attachments/:attachmentId",
  authRequired || fallback("authRequired"),
  deleteAttachment
);

// Inventory issues
router.post(
  "/work-orders/:id/issues",
  authRequired || fallback("authRequired"),
  createIssueForWorkOrder
);

router.post(
  "/issues/:issueId/lines",
  authRequired || fallback("authRequired"),
  addIssueLines
);

// Installations
router.post(
  "/work-orders/:id/installations",
  authRequired || fallback("authRequired"),
  addInstallations
);

router.get(
  "/work-orders/:id/installations",
  authRequired || fallback("authRequired"),
  listInstallations
);

// Work Order complete
router.post(
  "/work-orders/:id/complete",
  authRequired || fallback("authRequired"),
  completeWorkOrder
);

// Work Order runtime report (no close)
router.get(
  "/work-orders/:id/report",
  authRequired || fallback("authRequired"),
  getWorkOrderReport
);

// Post Maintenance QA (Upsert)
router.post(
  "/work-orders/:id/post-report",
  authRequired || fallback("authRequired"),
  upsertPostReport
);

// Vehicles options
router.get(
  "/vehicles/options",
  authRequired || fallback("authRequired"),
  listVehicleOptions
);

router.get("/work-orders", authRequired || fallback("authRequired"), listWorkOrders);
router.get("/work-orders/:id", authRequired || fallback("authRequired"), getWorkOrderById);

module.exports = router;
