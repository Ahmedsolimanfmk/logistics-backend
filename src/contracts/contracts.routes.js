// =======================
// src/contracts/contracts.routes.js
// =======================

const router = require("express").Router();

const controller = require("./contracts.controller");
const { requireAdminOrAccountant } = require("../auth/role.middleware");

// CREATE
router.post("/", requireAdminOrAccountant, controller.create);

// LIST
router.get("/", controller.list);

// GET
router.get("/:id", controller.getById);

// UPDATE
router.patch("/:id", requireAdminOrAccountant, controller.update);

// STATUS
router.patch("/:id/status", requireAdminOrAccountant, controller.setStatus);

module.exports = router;