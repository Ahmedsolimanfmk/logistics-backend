// =======================
// src/reports/reports.controller.js (UPDATED)
// =======================

const prisma = require("../prisma");

// Helpers
function getAuthUserId(req) {
  if (!req || !req.user) return null;
  return req.user.sub || req.user.id || req.user.userId || null;
}
function getAuthRole(req) {
  return req.user?.role || null;
}
function roleUpper(role) {
  return String(role || "").toUpperCase();
}
function isAccountantOrAdmin(role) {
  return ["ADMIN", "ACCOUNTANT"].includes(roleUpper(role));
}
function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}
function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}
function statusBucket(approval_status) {
  const s = String(approval_status || "").toUpperCase();
  if (s === "APPROVED" || s === "REAPPROVED") return "APPROVED";
  if (s === "REJECTED") return "REJECTED";
  if (s === "PENDING" || s === "APPEALED") return "PENDING";
  return "OTHER";
}
async function canSupervisorAccessTrip({ tripId, userId }) {
  const row = await prisma.trip_assignments.findFirst({
    where: { trip_id: tripId, field_supervisor_id: userId },
    select: { id: true },
  });
  return !!row;
}

// =======================================================
// GET /reports/trips/:tripId/finance
// =======================================================
async function getTripFinanceReport(req, res) {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { tripId } = req.params;
    if (!isUuid(tripId)) return res.status(400).json({ message: "Invalid tripId" });

    const includeExpenses = String(req.query.include_expenses ?? "true").toLowerCase() !== "false";
    const includeTimeline = String(req.query.include_timeline ?? "true").toLowerCase() !== "false";

    const trip = await prisma.trips.findUnique({
      where: { id: tripId },
      include: {
        clients: true,
        sites: true,
        trip_assignments: {
          orderBy: { assigned_at: "desc" },
          include: { vehicles: true, drivers: true, users: true },
        },
      },
    });
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (!isAccountantOrAdmin(role)) {
      const ok = await canSupervisorAccessTrip({ tripId, userId });
      if (!ok) return res.status(403).json({ message: "Forbidden" });
    }

    // ===== totals (no $transaction لتفادي timeouts) =====
    const [aggAll, groupedByStatus, groupedTypeStatus] = await Promise.all([
      prisma.cash_expenses.aggregate({
        where: { trip_id: tripId },
        _sum: { amount: true },
      }),
      prisma.cash_expenses.groupBy({
        by: ["approval_status"],
        where: { trip_id: tripId },
        _sum: { amount: true },
      }),
      prisma.cash_expenses.groupBy({
        by: ["expense_type", "approval_status"],
        where: { trip_id: tripId },
        _sum: { amount: true },
      }),
    ]);

    let total_approved = 0;
    let total_pending = 0;
    let total_rejected = 0;

    for (const r of groupedByStatus) {
      const v = toNumber(r._sum.amount);
      const b = statusBucket(r.approval_status);
      if (b === "APPROVED") total_approved += v;
      if (b === "PENDING") total_pending += v;
      if (b === "REJECTED") total_rejected += v;
    }

    // ===== split by payment_source =====
    const [advApprovedAgg, companyApprovedAgg] = await Promise.all([
      prisma.cash_expenses.aggregate({
        where: {
          trip_id: tripId,
          approval_status: { in: ["APPROVED", "REAPPROVED"] },
          payment_source: "ADVANCE",
        },
        _sum: { amount: true },
      }),
      prisma.cash_expenses.aggregate({
        where: {
          trip_id: tripId,
          approval_status: { in: ["APPROVED", "REAPPROVED"] },
          payment_source: "COMPANY",
        },
        _sum: { amount: true },
      }),
    ]);

    const totals = {
      total_recorded: toNumber(aggAll._sum.amount),
      total_approved,
      total_pending,
      total_rejected,
      approved_paid_from_advances: toNumber(advApprovedAgg._sum.amount),
      approved_paid_by_company: toNumber(companyApprovedAgg._sum.amount),
    };

    const grouped = {};
    for (const r of groupedTypeStatus) {
      const type = String(r.expense_type).toUpperCase();
      const bucket = statusBucket(r.approval_status);
      if (!grouped[type]) grouped[type] = { APPROVED: 0, PENDING: 0, REJECTED: 0, OTHER: 0 };
      grouped[type][bucket] += toNumber(r._sum.amount);
    }

    const grouped_by_expense_type = Object.entries(grouped).map(([k, v]) => ({
      expense_type: k,
      ...v,
      total: Object.values(v).reduce((a, b) => a + b, 0),
    }));

    // ===== linked advances (ADVANCE expenses only) =====
    const advanceIdsRaw = await prisma.cash_expenses.findMany({
    where: { trip_id: tripId, cash_advance_id: { not: null } },
    select: { cash_advance_id: true },
    });

const advanceIds = Array.from(new Set(advanceIdsRaw.map((r) => r.cash_advance_id)));

    const linked_advances = advanceIds.length
      ? await prisma.cash_advances.findMany({ where: { id: { in: advanceIds } } })
      : [];

    const total_advances_linked = linked_advances.reduce((a, b) => a + toNumber(b.amount), 0);

    // ✅ net based on ADVANCE-paid approved expenses only
    const net = total_advances_linked - totals.approved_paid_from_advances;

    const expenses = includeExpenses
      ? await prisma.cash_expenses.findMany({
          where: { trip_id: tripId },
          orderBy: { created_at: "desc" },
          include: {
            users_cash_expenses_created_byTousers: { select: { id: true, full_name: true } },
            users_cash_expenses_approved_byTousers: { select: { id: true, full_name: true } },
            users_cash_expenses_resolved_byTousers: { select: { id: true, full_name: true } },
          },
        })
      : [];

    const timeline = includeTimeline
      ? await prisma.trip_events.findMany({
          where: { trip_id: tripId },
          orderBy: { created_at: "desc" },
          take: 50,
        })
      : [];

    return res.json({
      trip,
      totals,
      grouped_by_expense_type,
      linked_advances,
      advances_totals: { total_advances_linked },
      balance: {
        remaining: Math.max(0, net),
        shortage: Math.max(0, -net),
        net,
      },
      expenses,
      timeline,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to generate trip finance report", error: e.message });
  }
}

// =======================================================
// GET /reports/supervisors/:supervisorId/ledger
// =======================================================
async function getSupervisorLedgerReport(req, res) {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { supervisorId } = req.params;
    if (!isUuid(supervisorId)) return res.status(400).json({ message: "Invalid supervisorId" });

    if (!isAccountantOrAdmin(role) && supervisorId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const advances = await prisma.cash_advances.findMany({
      where: { field_supervisor_id: supervisorId },
      orderBy: { created_at: "desc" },
    });

    const advanceIds = advances.map((a) => a.id);

    // ✅ only ADVANCE expenses affect supervisor ledger
    const expenses = await prisma.cash_expenses.findMany({
      where: { cash_advance_id: { in: advanceIds }, payment_source: "ADVANCE" },
    });

    const total_advances = advances.reduce((a, b) => a + toNumber(b.amount), 0);
    const total_approved = expenses
      .filter((e) => statusBucket(e.approval_status) === "APPROVED")
      .reduce((a, b) => a + toNumber(b.amount), 0);

    const net = total_advances - total_approved;

    return res.json({
      supervisor: await prisma.users.findUnique({
        where: { id: supervisorId },
        select: { id: true, full_name: true, role: true },
      }),
      totals: { total_advances, total_approved },
      balance: {
        remaining: Math.max(0, net),
        shortage: Math.max(0, -net),
        net,
      },
      advances,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Failed to generate supervisor ledger report", error: e.message });
  }
}

module.exports = {
  getTripFinanceReport,
  getSupervisorLedgerReport,
};
