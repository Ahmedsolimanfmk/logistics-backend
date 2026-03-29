// =======================
// src/maintenance/maintenance.routes.js
// =======================

const express = require("express");
const router = express.Router();

const jwtMod = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");

const authRequired =
  typeof jwtMod === "function"
    ? jwtMod
    : typeof jwtMod?.authRequired === "function"
    ? jwtMod.authRequired
    : null;

if (!authRequired) {
  console.error("❌ authRequired is not a function. Check ../auth/jwt.middleware export.");
}

const reqCtrl = require("./maintenance.requests.controller");
const invCtrl = require("./maintenance.inventory.controller");
const instCtrl = require("./maintenance.installations.controller");
const workCtrl = require("./maintenance.workorders.controller");
const vehCtrl = require("./maintenance.vehicles.controller");
const attCtrl = require("./maintenance.attachments.controller");

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

const createIssueForWorkOrder =
  pick(invCtrl, ["createIssueForWorkOrder"]) || fallback("createIssueForWorkOrder");

const addIssueLines = pick(invCtrl, ["addIssueLines"]) || fallback("addIssueLines");

const addInstallations = pick(instCtrl, ["addInstallations"]) || fallback("addInstallations");

const listInstallations = pick(instCtrl, ["listInstallations"]) || fallback("listInstallations");

const completeWorkOrder = pick(workCtrl, ["completeWorkOrder"]) || fallback("completeWorkOrder");

const getWorkOrderReport = pick(workCtrl, ["getWorkOrderReport"]) || fallback("getWorkOrderReport");

const upsertPostReport = pick(workCtrl, ["upsertPostReport"]) || fallback("upsertPostReport");

const listVehicleOptions = pick(vehCtrl, ["listVehicleOptions"]) || fallback("listVehicleOptions");

const listRequestAttachments =
  pick(attCtrl, ["listRequestAttachments"]) || fallback("listRequestAttachments");

const listWorkOrders = pick(workCtrl, ["listWorkOrders"]) || fallback("listWorkOrders");
const getWorkOrderById = pick(workCtrl, ["getWorkOrderById"]) || fallback("getWorkOrderById");

const uploadRequestAttachments =
  attCtrl && Array.isArray(attCtrl.uploadRequestAttachments)
    ? attCtrl.uploadRequestAttachments
    : fallback("uploadRequestAttachments");

const deleteAttachment = pick(attCtrl, ["deleteAttachment"]) || fallback("deleteAttachment");

// Global enforcement
router.use(authRequired || fallback("authRequired"));
router.use(requireCompany);

// Requests
router.post("/requests", createMaintenanceRequest);
router.get("/requests", listMaintenanceRequests);
router.get("/requests/:id", getMaintenanceRequestById);

router.post("/requests/:id/approve", approveMaintenanceRequest);
router.post("/requests/:id/reject", rejectMaintenanceRequest);

// Attachments
router.get("/requests/:id/attachments", listRequestAttachments);

if (Array.isArray(uploadRequestAttachments)) {
  router.post("/requests/:id/attachments", ...uploadRequestAttachments);
} else {
  router.post("/requests/:id/attachments", uploadRequestAttachments);
}

router.delete("/attachments/:attachmentId", deleteAttachment);

// Inventory issues
router.post("/work-orders/:id/issues", createIssueForWorkOrder);
router.post("/issues/:issueId/lines", addIssueLines);

// Installations
router.post("/work-orders/:id/installations", addInstallations);
router.get("/work-orders/:id/installations", listInstallations);

// Work Orders
router.post("/work-orders/:id/complete", completeWorkOrder);
router.get("/work-orders/:id/report", getWorkOrderReport);
router.post("/work-orders/:id/post-report", upsertPostReport);
router.get("/work-orders", listWorkOrders);
router.get("/work-orders/:id", getWorkOrderById);

// Vehicles options
router.get("/vehicles/options", listVehicleOptions);

module.exports = router;