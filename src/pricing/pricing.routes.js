// =======================
// src/pricing/pricing.routes.js
// =======================

const router = require("express").Router();

const controller = require("./pricing.controller");
const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");
const { requireAdminOrAccountant } = require("../auth/role.middleware");

// enforce auth + tenant
router.use(authRequired);
router.use(requireCompany);

// resolve price
router.post("/resolve", controller.resolve);
router.get("/resolve", controller.resolve);

// CRUD
router.post("/", requireAdminOrAccountant, controller.create);
router.get("/", controller.list);
router.get("/:id", controller.getById);
router.patch("/:id", requireAdminOrAccountant, controller.update);
router.patch("/:id/toggle", requireAdminOrAccountant, controller.toggle);

module.exports = router;