// =======================
// src/clients/clients.routes.js
// =======================

const router = require("express").Router();
const { authRequired } = require("../auth/jwt.middleware");

const clientsController = require("./clients.controller");

// ✅ CRUD + toggle (موجودين عندك)
router.get("/", authRequired, clientsController.listClients);
router.post("/", authRequired, clientsController.createClient);
router.put("/:id", authRequired, clientsController.updateClient);
router.patch("/:id/toggle", authRequired, clientsController.toggleClient);

// ✅ Details / Dashboard (سيشتغلوا فقط لو عملتهم في controller)
// - سيبهم متعطلين دلوقتي لو لسه ما كتبتهمش، علشان الديبلوي ما يقعش
if (typeof clientsController.getClientDetails === "function") {
  router.get("/:id/details", authRequired, clientsController.getClientDetails);
}

if (typeof clientsController.getClientDashboard === "function") {
  router.get("/:id/dashboard", authRequired, clientsController.getClientDashboard);
}

module.exports = router;