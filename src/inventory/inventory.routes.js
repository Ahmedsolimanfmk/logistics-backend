// =======================
// src/inventory/inventory.routes.js
// =======================

const express = require("express");

const warehousesCtrl = require("./warehouses.controller");
const partsCtrl = require("./parts.controller");
const receiptsCtrl = require("./receipts.controller");

const router = express.Router();

// ---------- Warehouses ----------
router.get("/warehouses", warehousesCtrl.listWarehouses);
router.post("/warehouses", warehousesCtrl.createWarehouse);
router.patch("/warehouses/:id", warehousesCtrl.updateWarehouse);

// ---------- Parts ----------
router.get("/parts", partsCtrl.listParts);
router.post("/parts", partsCtrl.createPart);
router.patch("/parts/:id", partsCtrl.updatePart);

// ---------- Receipts (Purchases) ----------
router.get("/receipts", receiptsCtrl.listReceipts);
router.get("/receipts/:id", receiptsCtrl.getReceipt);
router.post("/receipts", receiptsCtrl.createReceipt);            // DRAFT
router.post("/receipts/:id/post", receiptsCtrl.postReceipt);     // POSTED + part_items + cash_expense

module.exports = router;
