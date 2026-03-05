// =======================
// src/clients/clients.routes.js
// =======================

const router = require("express").Router();
const { authRequired } = require("../auth/jwt.middleware");

const clientsController = require("./clients.controller");

router.get("/", authRequired, clientsController.listClients);
router.post("/", authRequired, clientsController.createClient);
router.put("/:id", authRequired, clientsController.updateClient);

// ✅ profile update endpoint (no name required)
router.put("/:id/profile", authRequired, clientsController.updateClientProfile);

router.patch("/:id/toggle", authRequired, clientsController.toggleClient);

router.get("/:id/details", authRequired, clientsController.getClientDetails);
router.get("/:id/dashboard", authRequired, clientsController.getClientDashboard);

module.exports = router;