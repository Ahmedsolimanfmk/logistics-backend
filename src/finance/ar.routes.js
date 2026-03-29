const express = require("express");
const router = express.Router();

const ar = require("./ar.controller");
const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");

// enforce tenant
router.use(authRequired);
router.use(requireCompany);

// =======================
// Invoices
// =======================
router.get("/invoices", ar.listArInvoices);
router.get("/invoices/:id", ar.getArInvoiceById);
router.post("/invoices", ar.createArInvoice);

router.patch("/invoices/:id/submit", ar.submitArInvoice);
router.patch("/invoices/:id/approve", ar.approveArInvoice);
router.patch("/invoices/:id/reject", ar.rejectArInvoice);

// =======================
// Payments
// =======================
router.get("/payments", ar.listArPayments);
router.get("/payments/:id", ar.getArPaymentById);
router.post("/payments", ar.createArPayment);

router.patch("/payments/:id/submit", ar.submitArPayment);
router.patch("/payments/:id/approve", ar.approveArPayment);
router.patch("/payments/:id/reject", ar.rejectArPayment);

// allocate
router.post("/payments/:id/allocate", ar.allocateArPayment);

// allocations delete
router.delete(
  "/payments/:paymentId/allocations/:allocationId",
  ar.deleteArPaymentAllocation
);

// draft edit/delete
router.patch("/payments/:id", ar.updateArPaymentDraft);
router.delete("/payments/:id", ar.deleteArPaymentDraft);

// =======================
// Ledger
// =======================
router.get("/clients/:clientId/ledger", ar.getClientLedger);

module.exports = router;