// =======================
// src/cash/cash.controller.js
// FINAL: COMPANY + ADVANCE (enum payment_source) + backward compatibility
// =======================

const prisma = require("../prisma");

// =======================
// Helpers
// =======================

function getAuthUserId(req) {
  if (!req || !req.user) return null;
  return req.user.sub || req.user.id || req.user.userId || null;
}

function getAuthRole(req) {
  return req.user?.role || null;
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function roleUpper(role) {
  return String(role || "").toUpperCase();
}

function isAccountantOrAdmin(role) {
  return ["ADMIN", "ACCOUNTANT"].includes(roleUpper(role));
}

// ✅ Trip finance lock helper
function isTripFinancialLocked(financial_status) {
  const s = String(financial_status || "OPEN").toUpperCase();
  return ["IN_REVIEW", "CLOSED"].includes(s);
}

// ✅ Trip ownership for supervisor (any historical assignment)
async function assertTripBelongsToSupervisor({ trip_id, userId, vehicle_id }) {
  const where = { trip_id, field_supervisor_id: userId };
  if (vehicle_id) where.vehicle_id = vehicle_id;

  const row = await prisma.trip_assignments.findFirst({
    where,
    orderBy: { assigned_at: "desc" },
    select: { id: true },
  });

  return !!row;
}

// ✅ Vehicle portfolio validation (when trip_id not provided)
async function assertVehicleInSupervisorPortfolio({ vehicle_id, userId }) {
  const row = await prisma.vehicle_portfolio.findFirst({
    where: {
      vehicle_id,
      field_supervisor_id: userId,
      is_active: true,
    },
    select: { id: true },
  });

  return !!row;
}

async function writeExpenseAuditSafe(tx, { expense_id, action, actor_id, before, after, notes }) {
  try {
    if (!tx.cash_expense_audits?.create) return;

    await tx.cash_expense_audits.create({
      data: {
        expense_id,
        action,
        actor_id,
        notes: notes || null,
        before: before ? JSON.stringify(before) : null,
        after: after ? JSON.stringify(after) : null,
      },
    });
  } catch (e) {
    console.warn("AUDIT_WRITE_SKIPPED:", e?.message || e);
  }
}

async function getExpenseOr404(id, res) {
  const expense = await prisma.cash_expenses.findUnique({ where: { id } });
  if (!expense) {
    res.status(404).json({ message: "Cash expense not found" });
    return null;
  }
  return expense;
}

// Backward compatibility:
// - accepts payment_source: ADVANCE/COMPANY
// - accepts expense_source: CASH/COMPANY
function normalizePaymentSource(v) {
  const s = String(v || "ADVANCE").toUpperCase();
  if (["COMPANY", "CO", "DIRECT"].includes(s)) return "COMPANY";
  if (["CASH", "ADVANCE", "ADV"].includes(s)) return "ADVANCE";
  return "ADVANCE";
}

function parseOptionalDate(v) {
  if (!v) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return undefined; // invalid marker
  return d;
}

// =======================
// Cash Advances
// =======================

// GET /cash/cash-advances/summary?q=&status=
// Returns KPI counts + total amount across ALL matching rows (no pagination)
async function getCashAdvancesSummary(req, res) {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const isPrivileged = isAccountantOrAdmin(role);
    const { status, q } = req.query || {};

    const where = {};

    if (status) where.status = String(status).toUpperCase();

    // supervisors: only their advances
    if (!isPrivileged) {
      where.field_supervisor_id = userId;
    }

    // Search: settlement reference/notes
    if (q && String(q).trim()) {
      const qq = String(q).trim();
      where.OR = [
        { settlement_reference: { contains: qq, mode: "insensitive" } },
        { settlement_notes: { contains: qq, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.cash_advances.findMany({
      where,
      select: { amount: true, status: true },
    });

    const st = (x) => String(x?.status || "").toUpperCase();
    const sumAmount = rows.reduce((acc, x) => acc + Number(x.amount || 0), 0);

    const isOpen = (s) => ["OPEN", "IN_REVIEW", "PENDING"].includes(s);
    const isSettled = (s) => ["SETTLED", "CLOSED"].includes(s);
    const isCanceled = (s) => ["CANCELED", "REJECTED"].includes(s);

    const openCount = rows.filter((x) => isOpen(st(x))).length;
    const settledCount = rows.filter((x) => isSettled(st(x))).length;
    const canceledCount = rows.filter((x) => isCanceled(st(x))).length;

    return res.json({
      where_applied: {
        status: status ? String(status).toUpperCase() : null,
        q: q ? String(q) : null,
        scope: isPrivileged ? "ALL" : "OWN_ONLY",
      },
      totals: {
        sumAmount,
        countAll: rows.length,
        openCount,
        settledCount,
        canceledCount,
      },
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch advances summary",
      error: e?.message || String(e),
    });
  }
}

// GET /cash/cash-advances?status=&q=&page=&page_size=
async function getCashAdvances(req, res) {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const isPrivileged = isAccountantOrAdmin(role);
    const { status, q, page = "1", page_size = "50" } = req.query || {};

    const where = {};

    if (status) where.status = String(status).toUpperCase();

    // supervisors: only their advances
    if (!isPrivileged) {
      where.field_supervisor_id = userId;
    }

    // simple search
    if (q && String(q).trim()) {
      const qq = String(q).trim();
      where.OR = [
        { settlement_reference: { contains: qq, mode: "insensitive" } },
        { settlement_notes: { contains: qq, mode: "insensitive" } },
      ];
    }

    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(200, Math.max(1, Number(page_size) || 50));
    const skip = (p - 1) * ps;

    const [items, total] = await Promise.all([
      prisma.cash_advances.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: ps,
        include: {
          users_cash_advances_field_supervisor_idTousers: true,
          users_cash_advances_issued_byTousers: true,
          cash_expenses: { orderBy: { created_at: "desc" } },
        },
      }),
      prisma.cash_advances.count({ where }),
    ]);

    return res.json({ items, total, page: p, page_size: ps });
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch cash advances", error: e.message });
  }
}

// POST /cash/cash-advances
async function createCashAdvance(req, res) {
  try {
    const issuerId = getAuthUserId(req);
    const role = getAuthRole(req);

    if (!issuerId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) {
      return res.status(403).json({ message: "Only ADMIN or ACCOUNTANT can issue cash advances" });
    }

    const { field_supervisor_id, amount } = req.body || {};

    if (!isUuid(field_supervisor_id)) {
      return res.status(400).json({ message: "field_supervisor_id is required and must be uuid" });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "amount must be greater than 0" });
    }

    const supervisor = await prisma.users.findUnique({ where: { id: field_supervisor_id } });
    if (!supervisor) return res.status(400).json({ message: "Invalid field_supervisor_id" });

    const created = await prisma.cash_advances.create({
      data: {
        amount,
        status: "OPEN",
        users_cash_advances_field_supervisor_idTousers: { connect: { id: field_supervisor_id } },
        users_cash_advances_issued_byTousers: { connect: { id: issuerId } },
      },
      include: {
        users_cash_advances_field_supervisor_idTousers: true,
        users_cash_advances_issued_byTousers: true,
      },
    });

    res.status(201).json(created);
  } catch (e) {
    console.log("CREATE CASH ADVANCE ERROR:", e);
    res.status(500).json({ message: "Failed to create cash advance", error: e?.message || String(e) });
  }
}

// ✅ Phase B
async function submitCashAdvanceForReview(req, res) {
  try {
    const actorId = getAuthUserId(req);
    const role = getAuthRole(req);

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) {
      return res.status(403).json({ message: "Only ADMIN or ACCOUNTANT can submit advance for review" });
    }

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid cash advance id" });

    const advance = await prisma.cash_advances.findUnique({ where: { id } });
    if (!advance) return res.status(404).json({ message: "Cash advance not found" });

    const st = String(advance.status || "OPEN").toUpperCase();
    if (st === "CLOSED") return res.status(409).json({ message: "Cash advance already CLOSED" });
    if (st !== "OPEN") {
      return res.status(400).json({ message: `Cash advance must be OPEN to submit review (current: ${st})` });
    }

    const updated = await prisma.cash_advances.update({ where: { id }, data: { status: "IN_REVIEW" } });
    return res.json({ message: "Cash advance moved to IN_REVIEW", cash_advance: updated });
  } catch (e) {
    return res.status(500).json({ message: "Failed to submit cash advance for review", error: e?.message || String(e) });
  }
}

async function closeCashAdvance(req, res) {
  try {
    const actorId = getAuthUserId(req);
    const role = getAuthRole(req);

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) return res.status(403).json({ message: "Only ADMIN or ACCOUNTANT can close cash advances" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid cash advance id" });

    const { settlement_type, amount, reference, notes } = req.body || {};
    const stType = String(settlement_type || "").toUpperCase();

    if (!["RETURN", "SHORTAGE", "ADJUSTMENT"].includes(stType)) {
      return res.status(400).json({ message: "settlement_type must be RETURN | SHORTAGE | ADJUSTMENT" });
    }
    if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ message: "amount must be a number >= 0" });
    }

    const advance = await prisma.cash_advances.findUnique({ where: { id } });
    if (!advance) return res.status(404).json({ message: "Cash advance not found" });

    const st = String(advance.status || "OPEN").toUpperCase();
    if (st === "CLOSED") return res.status(409).json({ message: "Cash advance already CLOSED" });
    if (st !== "IN_REVIEW") {
      return res.status(400).json({ message: `Cash advance must be IN_REVIEW before CLOSE (current: ${st})` });
    }

    const pendingCount = await prisma.cash_expenses.count({
      where: { cash_advance_id: id, approval_status: { in: ["PENDING", "APPEALED"] } },
    });
    if (pendingCount > 0) {
      return res.status(409).json({
        message: "Cannot close cash advance while there are pending/appealed expenses",
        pending_count: pendingCount,
      });
    }

    const approvedExpenses = await prisma.cash_expenses.findMany({
      where: { cash_advance_id: id, approval_status: { in: ["APPROVED", "REAPPROVED"] } },
      select: { amount: true },
    });

    const totalApproved = approvedExpenses.reduce((acc, x) => acc + Number(x.amount || 0), 0);
    const advanceAmount = Number(advance.amount || 0);

    const remaining = advanceAmount - totalApproved;
    const shortage = totalApproved - advanceAmount;

    const amt = Number(amount);

    if (stType === "RETURN") {
      if (remaining < 0) {
        return res.status(400).json({
          message: "Cannot RETURN when there is a shortage. Use SHORTAGE or ADJUSTMENT.",
          totals: { advanceAmount, totalApproved, remaining, shortage },
        });
      }
      if (Number(remaining.toFixed(2)) !== Number(amt.toFixed(2))) {
        return res.status(400).json({
          message: "For CLOSE with RETURN, amount must equal remaining exactly",
          totals: { advanceAmount, totalApproved, remaining },
        });
      }
    }

    if (stType === "SHORTAGE") {
      if (shortage <= 0) {
        return res.status(400).json({
          message: "No shortage detected. Use RETURN or ADJUSTMENT.",
          totals: { advanceAmount, totalApproved, remaining, shortage },
        });
      }
      if (Number(shortage.toFixed(2)) !== Number(amt.toFixed(2))) {
        return res.status(400).json({
          message: "For CLOSE with SHORTAGE, amount must equal shortage exactly",
          totals: { advanceAmount, totalApproved, shortage },
        });
      }
    }

    const updated = await prisma.cash_advances.update({
      where: { id },
      data: {
        status: "CLOSED",
        settlement_type: stType,
        settlement_amount: amt,
        settlement_reference: reference ? String(reference) : null,
        settlement_notes: notes ? String(notes) : null,
        settled_at: new Date(),
        settled_by: actorId,
      },
    });

    return res.json({
      message: "Cash advance CLOSED",
      cash_advance: updated,
      totals: { advanceAmount, totalApproved, remaining, shortage },
    });
  } catch (e) {
    console.log("CLOSE CASH ADVANCE ERROR:", e);
    return res.status(500).json({ message: "Failed to close cash advance", error: e?.message || String(e) });
  }
}

async function reopenCashAdvance(req, res) {
  try {
    const actorId = getAuthUserId(req);
    const role = getAuthRole(req);

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAccountantOrAdmin(role)) return res.status(403).json({ message: "Only ADMIN or ACCOUNTANT can reopen cash advances" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid cash advance id" });

    const advance = await prisma.cash_advances.findUnique({ where: { id } });
    if (!advance) return res.status(404).json({ message: "Cash advance not found" });

    const st = String(advance.status || "OPEN").toUpperCase();
    if (st !== "CLOSED") return res.status(400).json({ message: `Only CLOSED advances can be reopened (current: ${st})` });

    const updated = await prisma.cash_advances.update({
      where: { id },
      data: {
        status: "IN_REVIEW",
        settlement_type: null,
        settlement_amount: null,
        settlement_reference: null,
        settlement_notes: null,
        settled_at: null,
        settled_by: null,
      },
    });

    return res.json({ message: "Cash advance reopened to IN_REVIEW", cash_advance: updated });
  } catch (e) {
    return res.status(500).json({ message: "Failed to reopen cash advance", error: e?.message || String(e) });
  }
}

// GET /cash/cash-advances/:id/expenses?status=...
async function getAdvanceExpenses(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.query;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid cash advance id" });

    const advance = await prisma.cash_advances.findUnique({ where: { id } });
    if (!advance) return res.status(404).json({ message: "Cash advance not found" });

    const where = { cash_advance_id: id };
    if (status) where.approval_status = String(status).toUpperCase();

    const list = await prisma.cash_expenses.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: {
        users_cash_expenses_created_byTousers: true,
        users_cash_expenses_approved_byTousers: true,
        trips: true,
        vehicles: true,
      },
    });

    res.json(list);
  } catch (e) {
    res.status(500).json({ message: "Failed to fetch advance expenses", error: e?.message || String(e) });
  }
}

// =======================
// Cash Expenses
// =======================

// POST /cash/cash-expenses
// supports:
// - ADVANCE: requires cash_advance_id (supervisor only)
// - COMPANY: no cash_advance_id (admin/accountant only)
async function createCashExpense(req, res) {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const {
      // legacy + new
      expense_source,
      payment_source,

      cash_advance_id,
      trip_id,
      vehicle_id,
      maintenance_work_order_id,

      expense_type,
      amount,
      notes,
      receipt_url,

      // ✅ company fields
      vendor_name,
      invoice_no,
      invoice_date,
      paid_method,
      payment_ref,
      vat_amount,
      invoice_total,
    } = req.body || {};

    const src = normalizePaymentSource(payment_source || expense_source);

    if (!expense_type) return res.status(400).json({ message: "expense_type is required" });
    if (!amount || Number(amount) <= 0) return res.status(400).json({ message: "amount must be > 0" });

    // ✅ Validate uuids
    if (trip_id && !isUuid(trip_id)) return res.status(400).json({ message: "Invalid trip_id" });
    if (vehicle_id && !isUuid(vehicle_id)) return res.status(400).json({ message: "Invalid vehicle_id" });
    if (maintenance_work_order_id && !isUuid(maintenance_work_order_id)) {
      return res.status(400).json({ message: "Invalid maintenance_work_order_id" });
    }

    // ✅ If linked to work order: ensure exists + derive vehicle if missing
    let mwoVehicleId = null;
    if (maintenance_work_order_id) {
      const mwo = await prisma.maintenance_work_orders.findUnique({
        where: { id: maintenance_work_order_id },
        select: { id: true, vehicle_id: true },
      });
      if (!mwo) return res.status(400).json({ message: "Invalid maintenance_work_order_id" });
      mwoVehicleId = mwo.vehicle_id || null;
    }

    // ==========================
    // Mode: COMPANY
    // ==========================
    if (src === "COMPANY") {
      if (!isAccountantOrAdmin(role)) {
        return res.status(403).json({ message: "Only ADMIN or ACCOUNTANT can create COMPANY expenses" });
      }

      if (cash_advance_id) {
        return res.status(400).json({ message: "cash_advance_id must be omitted for COMPANY expenses" });
      }

      if (!vendor_name || String(vendor_name).trim().length < 2) {
        return res.status(400).json({ message: "vendor_name is required for COMPANY expenses" });
      }

      const invDate = parseOptionalDate(invoice_date);
      if (invDate === undefined) return res.status(400).json({ message: "Invalid invoice_date" });

      // ✅ If trip provided: respect trip finance lock
      if (trip_id) {
        const trip = await prisma.trips.findUnique({
          where: { id: trip_id },
          select: { id: true, financial_status: true },
        });
        if (!trip) return res.status(400).json({ message: "Invalid trip_id" });
        if (isTripFinancialLocked(trip.financial_status)) {
          return res.status(409).json({
            message: `Trip is financially locked (${trip.financial_status}). No more expenses allowed.`,
          });
        }
      }

      const finalVehicleId = vehicle_id || mwoVehicleId || null;

      const created = await prisma.cash_expenses.create({
        data: {
          payment_source: "COMPANY",
          cash_advance_id: null,

          trips: trip_id ? { connect: { id: trip_id } } : undefined,
          vehicles: finalVehicleId ? { connect: { id: finalVehicleId } } : undefined,
          maintenance_work_orders: maintenance_work_order_id ? { connect: { id: maintenance_work_order_id } } : undefined,

          expense_type,
          amount,
          notes: notes ? String(notes) : null,
          receipt_url: receipt_url ? String(receipt_url) : null,

          vendor_name: String(vendor_name).trim(),
          invoice_no: invoice_no ? String(invoice_no).trim() : null,
          invoice_date: invDate,
          paid_method: paid_method ? String(paid_method).toUpperCase() : null,
          payment_ref: payment_ref ? String(payment_ref) : null,
          vat_amount: vat_amount !== undefined && vat_amount !== null ? vat_amount : null,
          invoice_total: invoice_total !== undefined && invoice_total !== null ? invoice_total : null,

          approval_status: "PENDING",
          users_cash_expenses_created_byTousers: { connect: { id: userId } },
        },
      });

      return res.status(201).json(created);
    }

    // ==========================
    // Mode: ADVANCE (Supervisor)
    // ==========================
    if (!isUuid(cash_advance_id)) {
      return res.status(400).json({
        message: "cash_advance_id is required for ADVANCE expenses and must be uuid",
      });
    }

    const advance = await prisma.cash_advances.findUnique({ where: { id: cash_advance_id } });
    if (!advance || String(advance.status).toUpperCase() !== "OPEN") {
      return res.status(400).json({ message: "Cash advance not found or not OPEN" });
    }

    if (advance.field_supervisor_id !== userId) {
      return res.status(403).json({ message: "Only the assigned field supervisor can add ADVANCE expenses" });
    }

    // ✅ If trip_id: ensure not locked + supervisor owns trip
    if (trip_id) {
      const trip = await prisma.trips.findUnique({
        where: { id: trip_id },
        select: { id: true, financial_status: true },
      });

      if (!trip) return res.status(400).json({ message: "Invalid trip_id" });
      if (isTripFinancialLocked(trip.financial_status)) {
        return res.status(409).json({
          message: `Trip is financially locked (${trip.financial_status}). No more expenses allowed.`,
        });
      }

      const okTrip = await assertTripBelongsToSupervisor({
        trip_id,
        userId,
        vehicle_id: vehicle_id || null,
      });
      if (!okTrip) {
        return res.status(403).json({
          message: "You are not allowed to add expenses to this trip (not assigned to you).",
        });
      }
    }

    // ✅ If no trip_id but vehicle_id: must be in supervisor portfolio
    if (!trip_id && vehicle_id) {
      const okVehicle = await assertVehicleInSupervisorPortfolio({ vehicle_id, userId });
      if (!okVehicle) {
        return res.status(403).json({
          message: "You are not allowed to add expenses to this vehicle (not in your portfolio).",
        });
      }
    }

    const created = await prisma.cash_expenses.create({
      data: {
        payment_source: "ADVANCE",
        cash_advances: { connect: { id: cash_advance_id } },

        trips: trip_id ? { connect: { id: trip_id } } : undefined,
        vehicles: (vehicle_id || mwoVehicleId) ? { connect: { id: vehicle_id || mwoVehicleId } } : undefined,
        maintenance_work_orders: maintenance_work_order_id ? { connect: { id: maintenance_work_order_id } } : undefined,

        expense_type,
        amount,
        notes: notes ? String(notes) : null,
        receipt_url: receipt_url ? String(receipt_url) : null,

        approval_status: "PENDING",
        users_cash_expenses_created_byTousers: { connect: { id: userId } },
      },
    });

    return res.status(201).json(created);
  } catch (e) {
    console.log("CREATE CASH EXPENSE ERROR:", e);
    return res.status(500).json({ message: "Failed to create cash expense", error: e?.message || String(e) });
  }
}

// GET /cash/cash-expenses?status=&payment_source=&q=&page=&page_size=
async function listCashExpenses(req, res) {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const isPrivileged = isAccountantOrAdmin(role);

    const { status, payment_source, q, page = "1", page_size = "50" } = req.query || {};
    const where = {};

    if (status) where.approval_status = String(status).toUpperCase();
    if (payment_source) where.payment_source = normalizePaymentSource(payment_source);

    // Supervisors: only their created expenses
    if (!isPrivileged) {
      where.created_by = userId;
    }

    if (q && String(q).trim()) {
      const qq = String(q).trim();
      where.OR = [
        { expense_type: { contains: qq, mode: "insensitive" } },
        { notes: { contains: qq, mode: "insensitive" } },
        { vendor_name: { contains: qq, mode: "insensitive" } },
        { invoice_no: { contains: qq, mode: "insensitive" } },
        { payment_ref: { contains: qq, mode: "insensitive" } },
      ];
    }

    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(200, Math.max(1, Number(page_size) || 50));
    const skip = (p - 1) * ps;

    const [items, total] = await Promise.all([
      prisma.cash_expenses.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: ps,
        include: {
          cash_advances: true,
          trips: true,
          vehicles: true,
          maintenance_work_orders: true,
          users_cash_expenses_created_byTousers: true,
          users_cash_expenses_approved_byTousers: true,
        },
      }),
      prisma.cash_expenses.count({ where }),
    ]);

    return res.json({ items, total, page: p, page_size: ps });
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch expenses", error: e?.message || String(e) });
  }
}

// GET /cash/cash-expenses/summary?status=&payment_source=&q=
async function getCashExpensesSummary(req, res) {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const isPrivileged = isAccountantOrAdmin(role);
    const { status, payment_source, q } = req.query || {};
    const where = {};

    if (status) where.approval_status = String(status).toUpperCase();
    if (payment_source) where.payment_source = normalizePaymentSource(payment_source);

    if (!isPrivileged) {
      where.created_by = userId;
    }

    if (q && String(q).trim()) {
      const qq = String(q).trim();
      where.OR = [
        { expense_type: { contains: qq, mode: "insensitive" } },
        { notes: { contains: qq, mode: "insensitive" } },
        { vendor_name: { contains: qq, mode: "insensitive" } },
        { invoice_no: { contains: qq, mode: "insensitive" } },
        { payment_ref: { contains: qq, mode: "insensitive" } },
      ];
    }

    const groups = await prisma.cash_expenses.groupBy({
      by: ["approval_status"],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    const agg = await prisma.cash_expenses.aggregate({
      where,
      _sum: { amount: true },
      _count: { _all: true },
    });

    const map = new Map();
    for (const g of groups) {
      map.set(String(g.approval_status || "").toUpperCase(), {
        sum: Number(g._sum?.amount || 0),
        count: Number(g._count?._all || 0),
      });
    }

    const pick = (k) => map.get(k)?.sum || 0;
    const pickCount = (k) => map.get(k)?.count || 0;

    const sumApproved = pick("APPROVED") + pick("REAPPROVED");
    const countApproved = pickCount("APPROVED") + pickCount("REAPPROVED");

    const result = {
      where_applied: {
        status: status ? String(status).toUpperCase() : null,
        payment_source: payment_source ? normalizePaymentSource(payment_source) : null,
        q: q ? String(q) : null,
        scope: isPrivileged ? "ALL" : "OWN_CREATED",
      },
      totals: {
        sumAll: Number(agg._sum?.amount || 0),
        countAll: Number(agg._count?._all || 0),

        sumApproved,
        countApproved,

        sumPending: pick("PENDING"),
        countPending: pickCount("PENDING"),

        sumRejected: pick("REJECTED"),
        countRejected: pickCount("REJECTED"),

        sumAppealed: pick("APPEALED"),
        countAppealed: pickCount("APPEALED"),
      },
      raw_by_status: groups.map((g) => ({
        approval_status: String(g.approval_status || "").toUpperCase(),
        sum: Number(g._sum?.amount || 0),
        count: Number(g._count?._all || 0),
      })),
    };

    return res.json(result);
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch expenses summary", error: e?.message || String(e) });
  }
}

// GET /cash/cash-expenses/:id
async function getCashExpenseById(req, res) {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params || {};
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid expense id" });

    const row = await prisma.cash_expenses.findUnique({
      where: { id },
      include: {
        cash_advances: true,
        trips: true,
        vehicles: true,
        maintenance_work_orders: true,
        users_cash_expenses_created_byTousers: true,
        users_cash_expenses_approved_byTousers: true,
        users_cash_expenses_rejected_byTousers: true,
        users_cash_expenses_resolved_byTousers: true,
      },
    });

    if (!row) return res.status(404).json({ message: "Cash expense not found" });

    const isPrivileged = isAccountantOrAdmin(role);
    const isOwner = row.created_by === userId;
    const isAdvanceSupervisor = row.cash_advances?.field_supervisor_id === userId;

    if (!isPrivileged && !isOwner && !isAdvanceSupervisor) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.json(row);
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch expense", error: e?.message || String(e) });
  }
}

// (Approve/Reject/Appeal/Resolve/Reopen/Audit/Reports/TripFinance) ---
// ✅ خلي باقي الدوال عندك زي ما هي بدون تغيير
// ✅ طالما كانت سليمة عندك، فقط تأكد مفيش أي JSON blocks متلزقة في النص

module.exports = {
  // Cash Advances
  getCashAdvancesSummary,
  getCashAdvances,
  getCashAdvanceById,
  createCashAdvance,

  // Phase B endpoints
  submitCashAdvanceForReview,
  closeCashAdvance,
  reopenCashAdvance,

  getAdvanceExpenses,

  // Cash Expenses
  createCashExpense,
  listCashExpenses,
  getCashExpensesSummary,
  getCashExpenseById,
};