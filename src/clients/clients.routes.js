// =======================
// src/clients/clients.routes.js
// =======================

const router = require("express").Router();
const { authRequired } = require("../auth/jwt.middleware");

const {
  listClients,
  createClient,
  updateClient,
  toggleClient,
} = require("./clients.controller");

router.get("/", authRequired, listClients);
router.post("/", authRequired, createClient);
router.put("/:id", authRequired, updateClient);
router.patch("/:id/toggle", authRequired, toggleClient);

module.exports = router;
