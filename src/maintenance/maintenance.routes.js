const express = require("express");
const router = express.Router();
const controller = require("./maintenance.controller");
const { authRequired } = require("../auth/jwt.middleware");
const { requireRole } = require("../auth/role.middleware");

// Requires authentication for all maintenance routes
router.use(authRequired);

// Dashboard access roles (managers, supervisors)
const adminRoles = ["SUPER_ADMIN", "ADMIN", "MAINTENANCE_MANAGER", "GENERAL_SUPERVISOR"];

// Requests
router.get("/requests", requireRole(...adminRoles, "FIELD_SUPERVISOR"), controller.getAllRequests);
router.put("/requests/:id/status", requireRole(...adminRoles), controller.updateRequestStatus);

// Work Orders
router.get("/work-orders", requireRole(...adminRoles, "FIELD_SUPERVISOR"), controller.getAllWorkOrders);
router.post("/work-orders", requireRole(...adminRoles), controller.createWorkOrder);
router.get("/work-orders/:id", requireRole(...adminRoles, "FIELD_SUPERVISOR"), controller.getWorkOrderById);
router.put("/work-orders/:id", requireRole(...adminRoles), controller.updateWorkOrder);

// Installations / Parts
router.get("/parts", requireRole(...adminRoles), controller.getPartsCatalog);
router.post("/work-orders/:id/parts", requireRole(...adminRoles), controller.addWorkOrderPart);

module.exports = router;