const express = require("express");
const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");

const controller = require("./contracts.controller");

const router = express.Router();

// =======================
// Guards
// =======================
router.use(authRequired);
router.use(requireCompany);

// =======================
// Routes
// =======================

// Create
router.post("/", controller.create);

// List
router.get("/", controller.list);

// Get by id
router.get("/:id", controller.getById);

// Update
router.patch("/:id", controller.update);

// Set status
router.post("/:id/status", controller.setStatus);

module.exports = router;