// =======================
// src/clients/clients.routes.js
// =======================

const router = require("express").Router();
const { authRequired } = require("../auth/jwt.middleware");

const clientsController = require("./clients.controller");

// =======================
// Clients CRUD
// =======================

router.get("/", authRequired, clientsController.listClients);

router.post("/", authRequired, clientsController.createClient);

router.put("/:id", authRequired, clientsController.updateClient);

// ✅ Profile update (no name required)
router.put(
  "/:id/profile",
  authRequired,
  clientsController.updateClientProfile
);

// =======================
// Status
// =======================

router.patch("/:id/toggle", authRequired, clientsController.toggleClient);

// =======================
// Details / Dashboard
// =======================

router.get("/:id/details", authRequired, clientsController.getClientDetails);

router.get("/:id/dashboard", authRequired, clientsController.getClientDashboard);

module.exports = router;