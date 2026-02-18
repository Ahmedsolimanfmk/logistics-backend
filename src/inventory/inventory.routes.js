// =======================
// src/inventory/inventory.routes.js
// =======================

const express = require("express");

const warehousesCtrl = require("./warehouses.controller");
const partsCtrl = require("./parts.controller");
const receiptsCtrl = require("./receipts.controller");

// NEW
const partItemsCtrl = require("./partItems.controller");
const requestsCtrl = require("./requests.controller");
const issuesCtrl = require("./issues.controller");

const router = express.Router();

// ---------- Warehouses ----------
router.get("/warehouses", warehousesCtrl.listWarehouses);
router.post("/warehouses", warehousesCtrl.createWarehouse);
router.patch("/warehouses/:id", warehousesCtrl.updateWarehouse);

// ---------- Parts ----------
router.get("/parts", partsCtrl.listParts);
router.post("/parts", partsCtrl.createPart);
router.patch("/parts/:id", partsCtrl.updatePart);

// ---------- Part Items (serial units lookup) ----------
router.get("/part-items", partItemsCtrl.listPartItems);

// ---------- Receipts (Purchases) ----------
router.get("/receipts", receiptsCtrl.listReceipts);
router.get("/receipts/:id", receiptsCtrl.getReceipt);
router.post("/receipts", receiptsCtrl.createReceipt);            // DRAFT
router.post("/receipts/:id/post", receiptsCtrl.postReceipt);     // POSTED + part_items + cash_expense

// ---------- Requests (maintenance -> store) ----------
router.get("/requests", requestsCtrl.listRequests);
router.get("/requests/:id", requestsCtrl.getRequest);
router.post("/requests", requestsCtrl.createRequest);
router.post("/requests/:id/approve", requestsCtrl.approveRequest);
router.post("/requests/:id/reject", requestsCtrl.rejectRequest);
router.post("/requests/:id/unreserve", requestsCtrl.unreserveRequest);


// ---------- Issues (storekeeper) ----------
router.get("/issues", issuesCtrl.listIssues);
router.get("/issues/:id", issuesCtrl.getIssue);
router.post("/issues", issuesCtrl.createIssueDraft);       // DRAFT
router.post("/issues/:id/post", issuesCtrl.postIssue);     // POST + mark part_items ISSUED

module.exports = router;
