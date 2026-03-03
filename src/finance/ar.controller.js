// =======================
// src/finance/ar.controller.js
// =======================

const prisma = require("../prisma");

// =======================
// Helpers
// =======================
function getAuthUserId(req) {
  return req?.user?.sub || req?.user?.id || req?.user?.userId || null;
}
function getAuthRole(req) {
  return req?.user?.role || null;
}
function roleUpper(role) {
  return String(role || "").toUpperCase();
}
function isAccountantOrAdmin(role) {
  return ["ADMIN", "ACCOUNTANT"].includes(roleUpper(role));
}

function toMoney(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function toDateOrNull(v) {
  if (!v) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// Invoice number generator: INV-YYYYMM-0001
async function generateInvoiceNo(tx, issueDate = new Date()) {
  const yyyy = issueDate.getFullYear();
  const mm = String(issueDate.getMonth() + 1).padStart(2, "0");
  const prefix = `INV-${yyyy}${mm}-`;

  const last = await tx.ar_invoices.findFirst({
    where: { invoice_no: { startsWith: prefix } },
    orderBy: { invoice_no: "desc" },
    select: { invoice_no: true },
  });

  let nextSeq = 1;
  if (last?.invoice_no) {
    const tail = String(last.invoice_no).slice(prefix.length);
    const n = Number.parseInt(tail, 10);
    if (Number.isFinite(n) && n > 0) nextSeq = n + 1;
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

// =======================
// Recompute invoice status based on POSTED allocations
// =======================
async function recomputeInvoicePaymentStatus(tx, invoiceId) {
  const inv = await tx.ar_invoices.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, total_amount: true },
  });
  if (!inv) return;

  const agg = await tx.ar_payment_allocations.aggregate({
    where: { invoice_id: invoiceId, ar_payments: { status: "POSTED" } },
    _sum: { amount_allocated: true },
  });

  const paid = Number(agg?._sum?.amount_allocated || 0);
  const total = Number(inv.total_amount || 0);

  // لا نلمس الفاتورة لو لسه DRAFT/REJECTED/CANCELLED
  if (["DRAFT", "REJECTED", "CANCELLED"].includes(inv.status)) return;

  let next = inv.status;
  if (paid <= 0) next = inv.status === "APPROVED" ? "APPROVED" : inv.status;
  else if (paid >= total) next = "PAID";
  else next = "PARTIALLY_PAID";

  if (next !== inv.status) {
    await tx.ar_invoices.update({ where: { id: invoiceId }, data: { status: next } });
  }
}

// =======================
// GET /finance/ar/invoices
// =======================
exports.listArInvoices = async (req, res) => {
  try {
    const items = await prisma.ar_invoices.findMany({
      orderBy: { created_at: "desc" },
      take: 50,
      include: {
        clients: { select: { id: true, name: true } },
        client_contracts: { select: { id: true, contract_no: true } },
      },
    });
    return res.json({ items, total: items.length });
  } catch (e) {
    console.error("listArInvoices error:", e);
    return res.status(500).json({ message: "Failed to load AR invoices" });
  }
};

// =======================
// POST /finance/ar/invoices
// =======================
exports.createArInvoice = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) {
      return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can create invoices" });
    }

    const client_id = String(req.body?.client_id || "").trim();
    const contract_id = req.body?.contract_id ? String(req.body.contract_id).trim() : null;

    const issue_date = toDateOrNull(req.body?.issue_date) || new Date();
    const due_date = toDateOrNull(req.body?.due_date);

    const amount = toMoney(req.body?.amount);
    if (!client_id) return res.status(400).json({ message: "client_id is required" });
    if (amount == null) return res.status(400).json({ message: "amount is required and must be >= 0" });

    const vat_amount_input = toMoney(req.body?.vat_amount);
    const vat_amount = vat_amount_input == null ? 0 : vat_amount_input;
    const total_amount = Math.round((amount + vat_amount) * 100) / 100;

    const notes = req.body?.notes != null ? String(req.body.notes) : null;
    const source_trip_id = req.body?.source_trip_id ? String(req.body.source_trip_id).trim() : null;

    // Retry few times in case invoice_no unique collision
    let created = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        created = await prisma.$transaction(async (tx) => {
          const client = await tx.clients.findUnique({ where: { id: client_id }, select: { id: true } });
          if (!client) {
            const err = new Error("Client not found");
            err.status = 404;
            throw err;
          }

          if (contract_id) {
            const contract = await tx.client_contracts.findUnique({
              where: { id: contract_id },
              select: { id: true, client_id: true },
            });
            if (!contract) {
              const err = new Error("Contract not found");
              err.status = 404;
              throw err;
            }
            if (contract.client_id !== client_id) {
              const err = new Error("Contract does not belong to this client");
              err.status = 400;
              throw err;
            }
          }

          const invoice_no = await generateInvoiceNo(tx, issue_date);

          return tx.ar_invoices.create({
            data: {
              client_id,
              contract_id,
              invoice_no,
              issue_date,
              due_date,
              amount,
              vat_amount,
              total_amount,
              status: "DRAFT",
              created_by: userId,
              notes,
              source_trip_id,
            },
          });
        });
        break;
      } catch (e) {
        if (e?.status) throw e;
        const msg = String(e?.message || "");
        if (msg.includes("Unique constraint") || msg.includes("invoice_no")) continue;
        throw e;
      }
    }

    if (!created) return res.status(409).json({ message: "Failed to generate unique invoice_no, try again" });
    return res.status(201).json(created);
  } catch (e) {
    console.error("createArInvoice error:", e);
    return res.status(e?.status || 500).json({ message: e?.message || "Failed to create AR invoice" });
  }
};

// =======================
// PATCH /finance/ar/invoices/:id/submit
// DRAFT -> SUBMITTED
// =======================
exports.submitArInvoice = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "id is required" });

    const inv = await prisma.ar_invoices.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ message: "Invoice not found" });

    if (inv.status !== "DRAFT") {
      return res.status(400).json({ message: `Only DRAFT invoices can be submitted. Current: ${inv.status}` });
    }

    const updated = await prisma.ar_invoices.update({
      where: { id },
      data: { status: "SUBMITTED" },
    });

    return res.json(updated);
  } catch (e) {
    console.error("submitArInvoice error:", e);
    return res.status(500).json({ message: "Failed to submit invoice" });
  }
};

// =======================
// PATCH /finance/ar/invoices/:id/approve
// SUBMITTED -> APPROVED
// =======================
exports.approveArInvoice = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can approve invoices" });

    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "id is required" });

    const inv = await prisma.ar_invoices.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ message: "Invoice not found" });

    if (inv.status !== "SUBMITTED") {
      return res.status(400).json({ message: `Only SUBMITTED invoices can be approved. Current: ${inv.status}` });
    }

    const updated = await prisma.ar_invoices.update({
      where: { id },
      data: {
        status: "APPROVED",
        approved_by: userId,
        approved_at: new Date(),
        rejection_reason: null,
      },
    });

    return res.json(updated);
  } catch (e) {
    console.error("approveArInvoice error:", e);
    return res.status(500).json({ message: "Failed to approve invoice" });
  }
};

// =======================
// PATCH /finance/ar/invoices/:id/reject
// SUBMITTED -> REJECTED
// =======================
exports.rejectArInvoice = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can reject invoices" });

    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "id is required" });

    const reason = req.body?.rejection_reason != null ? String(req.body.rejection_reason).trim() : "";
    if (!reason) return res.status(400).json({ message: "rejection_reason is required" });

    const inv = await prisma.ar_invoices.findUnique({ where: { id } });
    if (!inv) return res.status(404).json({ message: "Invoice not found" });

    if (inv.status !== "SUBMITTED") {
      return res.status(400).json({ message: `Only SUBMITTED invoices can be rejected. Current: ${inv.status}` });
    }

    const updated = await prisma.ar_invoices.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejection_reason: reason,
        approved_by: null,
        approved_at: null,
      },
    });

    return res.json(updated);
  } catch (e) {
    console.error("rejectArInvoice error:", e);
    return res.status(500).json({ message: "Failed to reject invoice" });
  }
};

// =======================
// GET /finance/ar/payments
// =======================
exports.listArPayments = async (req, res) => {
  try {
    const items = await prisma.ar_payments.findMany({
      orderBy: { created_at: "desc" },
      take: 50,
      include: { clients: { select: { id: true, name: true } } },
    });
    return res.json({ items, total: items.length });
  } catch (e) {
    console.error("listArPayments error:", e);
    return res.status(500).json({ message: "Failed to load AR payments" });
  }
};

// =======================
// GET /finance/ar/payments/:id
// Details: payment + allocations + invoice info + totals
// =======================
exports.getArPaymentById = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "id is required" });

    const payment = await prisma.ar_payments.findUnique({
      where: { id },
      include: {
        clients: { select: { id: true, name: true } },
        allocations: {
          orderBy: { created_at: "desc" },
          include: {
            ar_invoices: {
              select: {
                id: true,
                invoice_no: true,
                status: true,
                issue_date: true,
                due_date: true,
                total_amount: true,
              },
            },
          },
        },
      },
    });

    if (!payment) return res.status(404).json({ message: "Payment not found" });

    const amount = Number(payment.amount || 0);
    const allocated = (payment.allocations || []).reduce((s, a) => s + Number(a.amount_allocated || 0), 0);
    const remaining = Math.max(0, Math.round((amount - allocated) * 100) / 100);

    return res.json({
      payment: {
        id: payment.id,
        client: payment.clients,
        client_id: payment.client_id,
        payment_date: payment.payment_date,
        amount,
        method: payment.method,
        reference: payment.reference,
        notes: payment.notes,
        status: payment.status,
        created_by: payment.created_by,
        created_at: payment.created_at,
        approved_by: payment.approved_by,
        approved_at: payment.approved_at,
        rejection_reason: payment.rejection_reason,
      },
      totals: {
        allocated: Math.round(allocated * 100) / 100,
        remaining,
      },
      allocations: (payment.allocations || []).map((a) => ({
        id: a.id,
        payment_id: a.payment_id,
        invoice_id: a.invoice_id,
        amount_allocated: Number(a.amount_allocated || 0),
        created_at: a.created_at,
        invoice: a.ar_invoices,
      })),
    });
  } catch (e) {
    console.error("getArPaymentById error:", e);
    return res.status(500).json({ message: "Failed to load payment details" });
  }
};

// =======================
// POST /finance/ar/payments
// body: { client_id, payment_date?, amount, method?, reference?, notes? }
// =======================
exports.createArPayment = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can create payments" });

    const client_id = String(req.body?.client_id || "").trim();
    const payment_date = toDateOrNull(req.body?.payment_date) || new Date();
    const amount = toMoney(req.body?.amount);

    const method = req.body?.method ? String(req.body.method).trim() : "BANK_TRANSFER";
    const reference = req.body?.reference != null ? String(req.body.reference) : null;
    const notes = req.body?.notes != null ? String(req.body.notes) : null;

    if (!client_id) return res.status(400).json({ message: "client_id is required" });
    if (amount == null || amount <= 0) return res.status(400).json({ message: "amount must be > 0" });

    const created = await prisma.$transaction(async (tx) => {
      const client = await tx.clients.findUnique({ where: { id: client_id }, select: { id: true } });
      if (!client) {
        const err = new Error("Client not found");
        err.status = 404;
        throw err;
      }

      return tx.ar_payments.create({
        data: {
          client_id,
          payment_date,
          amount,
          method,
          reference,
          notes,
          status: "DRAFT",
          created_by: userId,
        },
      });
    });

    return res.status(201).json(created);
  } catch (e) {
    console.error("createArPayment error:", e);
    return res.status(e?.status || 500).json({ message: e?.message || "Failed to create payment" });
  }
};

// =======================
// PATCH /finance/ar/payments/:id/submit
// DRAFT -> SUBMITTED
// =======================
exports.submitArPayment = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "id is required" });

    const p = await prisma.ar_payments.findUnique({ where: { id } });
    if (!p) return res.status(404).json({ message: "Payment not found" });

    if (p.status !== "DRAFT") {
      return res.status(400).json({ message: `Only DRAFT payments can be submitted. Current: ${p.status}` });
    }

    const updated = await prisma.ar_payments.update({
      where: { id },
      data: { status: "SUBMITTED" },
    });

    return res.json(updated);
  } catch (e) {
    console.error("submitArPayment error:", e);
    return res.status(500).json({ message: "Failed to submit payment" });
  }
};

// =======================
// PATCH /finance/ar/payments/:id/reject
// SUBMITTED -> REJECTED
// =======================
exports.rejectArPayment = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can reject payments" });

    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "id is required" });

    const reason = req.body?.rejection_reason != null ? String(req.body.rejection_reason).trim() : "";
    if (!reason) return res.status(400).json({ message: "rejection_reason is required" });

    const p = await prisma.ar_payments.findUnique({ where: { id } });
    if (!p) return res.status(404).json({ message: "Payment not found" });

    if (p.status !== "SUBMITTED") {
      return res.status(400).json({ message: `Only SUBMITTED payments can be rejected. Current: ${p.status}` });
    }

    const updated = await prisma.ar_payments.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejection_reason: reason,
        approved_by: null,
        approved_at: null,
      },
    });

    return res.json(updated);
  } catch (e) {
    console.error("rejectArPayment error:", e);
    return res.status(500).json({ message: "Failed to reject payment" });
  }
};

// =======================
// PATCH /finance/ar/payments/:id/approve
// SUBMITTED -> POSTED
// =======================
exports.approveArPayment = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can approve payments" });

    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "id is required" });

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.ar_payments.findUnique({
        where: { id },
        include: { allocations: { select: { invoice_id: true } } },
      });
      if (!p) {
        const e = new Error("Payment not found");
        e.status = 404;
        throw e;
      }
      if (p.status !== "SUBMITTED") {
        const e = new Error(`Only SUBMITTED payments can be approved. Current: ${p.status}`);
        e.status = 400;
        throw e;
      }

      const up = await tx.ar_payments.update({
        where: { id },
        data: {
          status: "POSTED",
          approved_by: userId,
          approved_at: new Date(),
          rejection_reason: null,
        },
      });

      const invoiceIds = Array.from(new Set((p.allocations || []).map((x) => x.invoice_id).filter(Boolean)));
      for (const invId of invoiceIds) {
        await recomputeInvoicePaymentStatus(tx, invId);
      }

      return up;
    });

    return res.json(updated);
  } catch (e) {
    console.error("approveArPayment error:", e);
    return res.status(e?.status || 500).json({ message: e?.message || "Failed to approve payment" });
  }
};

// =======================
// POST /finance/ar/payments/:id/allocate
// body: { invoice_id, amount }
// =======================
exports.allocateArPayment = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can allocate payments" });

    const paymentId = String(req.params?.id || "").trim();
    const invoice_id = String(req.body?.invoice_id || "").trim();
    const amount = toMoney(req.body?.amount);

    if (!paymentId) return res.status(400).json({ message: "payment id is required" });
    if (!invoice_id) return res.status(400).json({ message: "invoice_id is required" });
    if (amount == null || amount <= 0) return res.status(400).json({ message: "amount must be > 0" });

    const result = await prisma.$transaction(async (tx) => {
      const pay = await tx.ar_payments.findUnique({
        where: { id: paymentId },
        include: { allocations: true },
      });
      if (!pay) {
        const e = new Error("Payment not found");
        e.status = 404;
        throw e;
      }
      if (pay.status === "POSTED") {
        const e = new Error("Cannot allocate a POSTED payment");
        e.status = 400;
        throw e;
      }

      const inv = await tx.ar_invoices.findUnique({
        where: { id: invoice_id },
        select: { id: true, client_id: true, status: true, total_amount: true },
      });
      if (!inv) {
        const e = new Error("Invoice not found");
        e.status = 404;
        throw e;
      }
      if (inv.client_id !== pay.client_id) {
        const e = new Error("Invoice does not belong to the payment client");
        e.status = 400;
        throw e;
      }
      if (!["APPROVED", "PARTIALLY_PAID"].includes(inv.status)) {
        const e = new Error(`Invoice must be APPROVED/PARTIALLY_PAID to allocate. Current: ${inv.status}`);
        e.status = 400;
        throw e;
      }

      // remaining payment
      const allocatedSoFar = (pay.allocations || []).reduce((s, x) => s + Number(x.amount_allocated || 0), 0);
      const remainingPayment = Number(pay.amount || 0) - allocatedSoFar;

      if (amount > remainingPayment) {
        const e = new Error(`Allocation exceeds remaining payment amount. Remaining: ${remainingPayment}`);
        e.status = 400;
        throw e;
      }

      // remaining invoice (all allocations, regardless of posted)
      const invAgg = await tx.ar_payment_allocations.aggregate({
        where: { invoice_id },
        _sum: { amount_allocated: true },
      });
      const invAllocatedAll = Number(invAgg?._sum?.amount_allocated || 0);
      const invTotal = Number(inv.total_amount || 0);
      const invRemaining = Math.max(0, Math.round((invTotal - invAllocatedAll) * 100) / 100);

      if (amount > invRemaining) {
        const e = new Error(`Allocation exceeds invoice remaining. Remaining: ${invRemaining}`);
        e.status = 400;
        throw e;
      }

      // Upsert by (payment_id, invoice_id)
      const existing = await tx.ar_payment_allocations.findFirst({
        where: { payment_id: paymentId, invoice_id },
      });

      let alloc;
      if (!existing) {
        alloc = await tx.ar_payment_allocations.create({
          data: { payment_id: paymentId, invoice_id, amount_allocated: amount },
        });
      } else {
        alloc = await tx.ar_payment_allocations.update({
          where: { id: existing.id },
          data: { amount_allocated: Math.round((Number(existing.amount_allocated || 0) + amount) * 100) / 100 },
        });
      }

      return {
        allocation: alloc,
        payment: {
          id: pay.id,
          amount: Number(pay.amount || 0),
          allocated_so_far: Math.round((allocatedSoFar + amount) * 100) / 100,
          remaining: Math.round((remainingPayment - amount) * 100) / 100,
        },
      };
    });

    return res.status(201).json(result);
  } catch (e) {
    console.error("allocateArPayment error:", e);
    return res.status(e?.status || 500).json({ message: e?.message || "Failed to allocate payment" });
  }
};

// =======================
// GET /finance/ar/clients/:clientId/ledger
// =======================
exports.getClientLedger = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const clientId = String(req.params?.clientId || "").trim();
    if (!clientId) return res.status(400).json({ message: "clientId is required" });

    const client = await prisma.clients.findUnique({
      where: { id: clientId },
      select: { id: true, name: true },
    });
    if (!client) return res.status(404).json({ message: "Client not found" });

    const invoices = await prisma.ar_invoices.findMany({
      where: { client_id: clientId, status: { in: ["APPROVED", "PARTIALLY_PAID", "PAID"] } },
      orderBy: { issue_date: "desc" },
      select: {
        id: true,
        invoice_no: true,
        issue_date: true,
        due_date: true,
        status: true,
        total_amount: true,
        payments: {
          select: {
            amount_allocated: true,
            ar_payments: { select: { status: true } },
          },
        },
      },
    });

    const invoiceRows = invoices.map((inv) => {
      const paid = (inv.payments || [])
        .filter((p) => p.ar_payments?.status === "POSTED")
        .reduce((s, p) => s + Number(p.amount_allocated || 0), 0);

      const total = Number(inv.total_amount || 0);
      const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);

      return {
        id: inv.id,
        invoice_no: inv.invoice_no,
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        status: inv.status,
        total_amount: total,
        paid_amount: Math.round(paid * 100) / 100,
        remaining_amount: remaining,
      };
    });

    const totalInvoiced = invoiceRows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const totalPaid = invoiceRows.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
    const balance = Math.round((totalInvoiced - totalPaid) * 100) / 100;

    return res.json({
      client,
      summary: {
        total_invoiced: Math.round(totalInvoiced * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        balance,
      },
      invoices: invoiceRows,
    });
  } catch (e) {
    console.error("getClientLedger error:", e);
    return res.status(500).json({ message: "Failed to load ledger" });
  }
};

// =======================
// PATCH /finance/ar/payments/:id
// allowed: DRAFT only
// =======================
exports.updateArPaymentDraft = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can update payments" });

    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "id is required" });

    const p = await prisma.ar_payments.findUnique({ where: { id } });
    if (!p) return res.status(404).json({ message: "Payment not found" });
    if (p.status !== "DRAFT") return res.status(400).json({ message: `Only DRAFT can be edited. Current: ${p.status}` });

    const payment_date = toDateOrNull(req.body?.payment_date) ?? p.payment_date;
    const amount = req.body?.amount != null ? toMoney(req.body.amount) : Number(p.amount);
    const method = req.body?.method != null ? String(req.body.method).trim() : p.method;
    const reference = req.body?.reference !== undefined ? (req.body.reference == null ? null : String(req.body.reference)) : p.reference;
    const notes = req.body?.notes !== undefined ? (req.body.notes == null ? null : String(req.body.notes)) : p.notes;

    if (amount == null || amount <= 0) return res.status(400).json({ message: "amount must be > 0" });

    // منع تقليل amount تحت إجمالي allocations الحالية
    const agg = await prisma.ar_payment_allocations.aggregate({
      where: { payment_id: id },
      _sum: { amount_allocated: true },
    });
    const allocated = Number(agg?._sum?.amount_allocated || 0);
    if (amount < allocated) {
      return res.status(400).json({ message: `amount cannot be less than allocated (${allocated})` });
    }

    const updated = await prisma.ar_payments.update({
      where: { id },
      data: { payment_date, amount, method, reference, notes },
    });

    return res.json(updated);
  } catch (e) {
    console.error("updateArPaymentDraft error:", e);
    return res.status(500).json({ message: "Failed to update payment" });
  }
};

// =======================
// DELETE /finance/ar/payments/:paymentId/allocations/:allocationId
// =======================
exports.deleteArPaymentAllocation = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can edit allocations" });

    const paymentId = String(req.params?.paymentId || "").trim();
    const allocationId = String(req.params?.allocationId || "").trim();
    if (!paymentId || !allocationId) return res.status(400).json({ message: "paymentId and allocationId are required" });

    const pay = await prisma.ar_payments.findUnique({ where: { id: paymentId }, select: { id: true, status: true } });
    if (!pay) return res.status(404).json({ message: "Payment not found" });
    if (pay.status === "POSTED") return res.status(400).json({ message: "Cannot modify allocations for POSTED payment" });

    const alloc = await prisma.ar_payment_allocations.findUnique({
      where: { id: allocationId },
      select: { id: true, payment_id: true },
    });
    if (!alloc || alloc.payment_id !== paymentId) return res.status(404).json({ message: "Allocation not found for this payment" });

    await prisma.ar_payment_allocations.delete({ where: { id: allocationId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("deleteArPaymentAllocation error:", e);
    return res.status(500).json({ message: "Failed to delete allocation" });
  }
};

// =======================
// DELETE /finance/ar/payments/:id
// allowed: DRAFT only
// =======================
exports.deleteArPaymentDraft = async (req, res) => {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can delete payments" });

    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "id is required" });

    const p = await prisma.ar_payments.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!p) return res.status(404).json({ message: "Payment not found" });
    if (p.status !== "DRAFT") return res.status(400).json({ message: `Only DRAFT can be deleted. Current: ${p.status}` });

    // allocations عليها onDelete Cascade -> هتتمسح تلقائيًا
    await prisma.ar_payments.delete({ where: { id } });

    return res.json({ ok: true });
  } catch (e) {
    console.error("deleteArPaymentDraft error:", e);
    return res.status(500).json({ message: "Failed to delete payment" });
  }
};