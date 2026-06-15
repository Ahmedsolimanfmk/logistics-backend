// backend/src/fuel/fuel.routes.js
const { Router } = require("express");
const controller = require("./fuel.controller");
const { authRequired, requireRole } = require("../auth/jwt.middleware");

const router = Router();

// ===============================
// Super Admin Routes
// ===============================
// Stations
router.post("/admin/stations", authRequired, requireRole(["SUPER_ADMIN"]), controller.createStation);
router.get("/admin/stations", authRequired, requireRole(["SUPER_ADMIN"]), controller.listStations);
router.put("/admin/stations/:id", authRequired, requireRole(["SUPER_ADMIN"]), controller.updateStation);

// Recharges & Transactions
router.get("/admin/recharges", authRequired, requireRole(["SUPER_ADMIN"]), controller.listAllRecharges);
router.post("/admin/recharges/:id/approve", authRequired, requireRole(["SUPER_ADMIN"]), controller.approveRecharge);
router.post("/admin/recharges/:id/reject", authRequired, requireRole(["SUPER_ADMIN"]), controller.rejectRecharge);

router.get("/admin/transactions", authRequired, requireRole(["SUPER_ADMIN"]), controller.listAllTransactions);

// ===============================
// Company Routes
// ===============================
router.post("/recharges", authRequired, controller.requestRecharge);
router.get("/recharges", authRequired, controller.listCompanyRecharges);

router.get("/transactions", authRequired, controller.listCompanyTransactions);

// ===============================
// Public/Simulator Route
// ===============================
router.post("/simulate", controller.simulateTransaction); // In real app, secured by Station Auth

module.exports = router;
