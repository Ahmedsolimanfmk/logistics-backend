// =======================
// src/clients/clients.routes.js
// =======================

const router = require("express").Router();
const { authRequired } = require("../auth/jwt.middleware");

const clientsController = require("./clients.controller");

router.get("/", authRequired, clientsController.listClients);
router.post("/", authRequired, clientsController.createClient);
router.put("/:id", authRequired, clientsController.updateClient);

// ✅ add this (alias for profile update)
router.put("/:id/profile", authRequired, clientsController.updateClient);

router.patch("/:id/toggle", authRequired, clientsController.toggleClient);

router.get("/:id/details", authRequired, clientsController.getClientDetails);
router.get("/:id/dashboard", authRequired, clientsController.getClientDashboard);

module.exports = router;