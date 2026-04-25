const express = require("express");

const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");

const {
  requireCompanyActive,
  requireCompanyFeature,
} = require("../companies/company-access.middleware");

const warehousesCtrl = require("./warehouses.controller");
const partsCtrl = require("./parts.controller");
const receiptsCtrl = require("./receipts.controller");
const partItemsCtrl = require("./partItems.controller");
const requestsCtrl = require("./requests.controller");
const issuesCtrl = require("./issues.controller");
const stockCtrl = require("./stock.controller");
// ✅ NEW
const categoriesCtrl = require("./categories.controller");

const router = express.Router();

// 🔥 IMPORTANT
router.use(authRequired);
router.use(requireCompany);
router.use(requireCompanyActive);
router.use(requireCompanyFeature("inventory.access"));

// ---------- Warehouses ----------
router.get("/warehouses", warehousesCtrl.listWarehouses);
router.post("/warehouses", warehousesCtrl.createWarehouse);
router.patch("/warehouses/:id", warehousesCtrl.updateWarehouse);

// ---------- Categories (NEW) ----------
router.get("/categories", categoriesCtrl.listCategories);
router.get("/categories/:id", categoriesCtrl.getCategory);
router.post("/categories", categoriesCtrl.createCategory);
router.patch("/categories/:id", categoriesCtrl.updateCategory);
router.delete("/categories/:id", categoriesCtrl.deleteCategory);

// ---------- Parts ----------
router.get("/parts", partsCtrl.listParts);
router.post("/parts", partsCtrl.createPart);
router.patch("/parts/:id", partsCtrl.updatePart);

// ---------- Part Items ----------
router.get("/part-items", partItemsCtrl.listPartItems);
// ---------- Stock ----------
router.get("/stock", stockCtrl.listStock);

// ---------- Receipts ----------
router.get("/receipts", receiptsCtrl.listReceipts);
router.get("/receipts/:id", receiptsCtrl.getReceipt);
router.post("/receipts", receiptsCtrl.createReceipt);
router.post("/receipts/:id/submit", receiptsCtrl.submitReceipt);
router.post("/receipts/:id/post", receiptsCtrl.postReceipt);
router.post("/receipts/:id/cancel", receiptsCtrl.cancelReceipt);

// ---------- Requests ----------
router.get("/requests", requestsCtrl.listRequests);
router.get("/requests/:id", requestsCtrl.getRequest);
router.post("/requests", requestsCtrl.createRequest);
router.post("/requests/:id/approve", requestsCtrl.approveRequest);
router.post("/requests/:id/reject", requestsCtrl.rejectRequest);
router.post("/requests/:id/unreserve", requestsCtrl.unreserveRequest);

// ---------- Issues ----------
router.get("/issues", issuesCtrl.listIssues);
router.get("/issues/:id", issuesCtrl.getIssue);
router.post("/issues", issuesCtrl.createIssueDraft);
router.post("/issues/:id/post", issuesCtrl.postIssue);

module.exports = router;