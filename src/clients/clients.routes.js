// =======================
// src/clients/clients.routes.js
// =======================

const express = require("express");
const { authRequired } = require("../middleware/jwt.middleware");
const clientsController = require("./clients.controller");

const router = express.Router();

// List/Create/Update/Toggle
router.get("/", authRequired, clientsController.listClients);
router.post("/", authRequired, clientsController.createClient);
router.put("/:id", authRequired, clientsController.updateClient);
router.patch("/:id/toggle", authRequired, clientsController.toggleClient);

// ✅ NEW: Dashboard endpoint
router.get("/:id/dashboard", authRequired, clientsController.getClientDashboard);



module.exports = router;