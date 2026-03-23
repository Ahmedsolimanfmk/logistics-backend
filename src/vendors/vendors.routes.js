const express = require("express");
const controller = require("./vendors.controller");

const router = express.Router();

// lightweight options list for selects/dropdowns
router.get("/options/list", controller.options);

// list vendors
router.get("/", controller.list);

// get vendor by id
router.get("/:id", controller.getById);

// create vendor
router.post("/", controller.create);

// update vendor
router.put("/:id", controller.update);

// toggle active/inactive
router.patch("/:id/toggle", controller.toggle);

module.exports = router;