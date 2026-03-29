// =======================
// src/reports/reports.controller.js
// tenant-safe version
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

function statusBucket(approvalStatus) {
  const s = String(approvalStatus || "").toUpperCase();
  if (s === "APPROVED" || s === "REAPPROVED") return "APPROVED";
  if (s === "REJECTED") return "REJECTED";
  if (s === "PENDING" || s === "APPEALED") return "PENDING";
  return "OTHER";
}

function buildTripLocationLabel(trip) {
  if (!trip) return null;
  return trip?.site?.name || null;
}

async function canSupervisorAccessTrip({ companyId, tripId, userId }) {
  const row = await prisma.trip_assignments.findFirst({
    where: {
      company_id: companyId,
      trip_id: tripId,
      field_supervisor_id: userId,
    },
    select: { id: true },
  });

  return !!row;
}

async function getSupervisorMembershipOrThrow(companyId, supervisorId) {
  const membership = await prisma.company_users.findFirst({
    where: {
      company_id: companyId,
      user_id: supervisorId,
      is_active: true,
      status: "ACTIVE",
    },
    select: {
      id: true,
      company_id: true,
      user_id: true,
      company_role: true,
      status: true,
      is_active: true,
      joined_at: true,
      users: {
        select: {
          id: true,
          full_name: true,
          role: true,
          email: true,
          phone: true,
          is_active: true,
        },
      },
    },
  });

  if (!membership) {
    const err = new Error("Supervisor not found");
    err.statusCode = 404;
    throw err;
  }

  return membership;
}

// =======================================================
// GET /reports/trips/:tripId/finance
// =======================================================
async function getTripFinanceReport(req, res) {
  try {
    const companyId = req.companyId;
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { tripId } = req.params;
    if (!isUuid(tripId)) {
      return res.status(400).json({ message: "Invalid tripId" });
    }

    const includeExpenses =
      String(req.query.include_expenses ?? "true").toLowerCase() !== "false";
    const includeTimeline =
      String(req.query.include_timeline ?? "true").toLowerCase() !== "false";

    const trip = await prisma.trips.findFirst({
      where: {
        id: tripId,
        company_id: companyId,
      },
      include: {
        client: true,
        site: true,
        trip_assignments: {
          where: {
            company_id: companyId,
          },
          orderBy: { assigned_at: "desc" },
          include: {
            vehicle: true,
            driver: true,
            field_supervisor: true,
          },
        },
      },
    });

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    if (!isAccountantOrAdmin(role)) {
      const ok = await canSupervisorAccessTrip({
        companyId,
        tripId,
        userId,
      });

      if (!ok) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const [aggAll, groupedByStatus, groupedTypeStatus] = await Promise.all([
      prisma.cash_expenses.aggregate({
        where: {
          company_id: companyId,
          trip_id: tripId,
        },
        _sum: { amount: true },
      }),
      prisma.cash_expenses.groupBy({
        by: ["approval_status"],
        where: {
          company_id: companyId,
          trip_id: tripId,
        },
        _sum: { amount: true },
      }),
      prisma.cash_expenses.groupBy({
        by: ["expense_type", "approval_status"],
        where: {
          company_id: companyId,
          trip_id: tripId,
        },
        _sum: { amount: true },
      }),
    ]);

    let totalApproved = 0;
    let totalPending = 0;
    let totalRejected = 0;

    for (const row of groupedByStatus) {
      const amount = toNumber(row._sum.amount);
      const bucket = statusBucket(row.approval_status);

      if (bucket === "APPROVED") totalApproved += amount;
      if (bucket === "PENDING") totalPending += amount;
      if (bucket === "REJECTED") totalRejected += amount;
    }

    const [advApprovedAgg, companyApprovedAgg] = await Promise.all([
      prisma.cash_expenses.aggregate({
        where: {
          company_id: companyId,
          trip_id: tripId,
          approval_status: { in: ["APPROVED", "REAPPROVED"] },
          payment_source: "ADVANCE",
        },
        _sum: { amount: true },
      }),
      prisma.cash_expenses.aggregate({
        where: {
          company_id: companyId,
          trip_id: tripId,
          approval_status: { in: ["APPROVED", "REAPPROVED"] },
          payment_source: "COMPANY",
        },
        _sum: { amount: true },
      }),
    ]);

    const totals = {
      total_recorded: toNumber(aggAll._sum.amount),
      total_approved: totalApproved,
      total_pending: totalPending,
      total_rejected: totalRejected,
      approved_paid_from_advances: toNumber(advApprovedAgg._sum.amount),
      approved_paid_by_company: toNumber(companyApprovedAgg._sum.amount),
    };

    const grouped = {};
    for (const row of groupedTypeStatus) {
      const type = String(row.expense_type).toUpperCase();
      const bucket = statusBucket(row.approval_status);

      if (!grouped[type]) {
        grouped[type] = {
          APPROVED: 0,
          PENDING: 0,
          REJECTED: 0,
          OTHER: 0,
        };
      }

      grouped[type][bucket] += toNumber(row._sum.amount);
    }

    const grouped_by_expense_type = Object.entries(grouped).map(([expenseType, data]) => ({
      expense_type: expenseType,
      ...data,
      total: Object.values(data).reduce((a, b) => a + b, 0),
    }));

    const advanceIdsRaw = await prisma.cash_expenses.findMany({
      where: {
        company_id: companyId,
        trip_id: tripId,
        cash_advance_id: { not: null },
      },
      select: { cash_advance_id: true },
    });

    const advanceIds = Array.from(
      new Set(advanceIdsRaw.map((row) => row.cash_advance_id).filter(Boolean))
    );

    const linked_advances = advanceIds.length
      ? await prisma.cash_advances.findMany({
          where: {
            company_id: companyId,
            id: { in: advanceIds },
          },
          orderBy: { created_at: "desc" },
        })
      : [];

    const total_advances_linked = linked_advances.reduce(
      (sum, item) => sum + toNumber(item.amount),
      0
    );

    const net = total_advances_linked - totals.approved_paid_from_advances;

    const expenses = includeExpenses
      ? await prisma.cash_expenses.findMany({
          where: {
            company_id: companyId,
            trip_id: tripId,
          },
          orderBy: { created_at: "desc" },
          include: {
            trip: {
              select: {
                id: true,
                trip_code: true,
                status: true,
                client: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                site: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            vehicle: {
              select: {
                id: true,
                fleet_no: true,
                plate_no: true,
                display_name: true,
              },
            },
            created_by_user: {
              select: {
                id: true,
                full_name: true,
              },
            },
            approved_by_user: {
              select: {
                id: true,
                full_name: true,
              },
            },
            resolved_by_user: {
              select: {
                id: true,
                full_name: true,
              },
            },
            vendor: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        })
      : [];

    const timeline = includeTimeline
      ? await prisma.trip_events.findMany({
          where: {
            company_id: companyId,
            trip_id: tripId,
          },
          orderBy: { created_at: "desc" },
          take: 50,
          include: {
            actor: {
              select: {
                id: true,
                full_name: true,
                role: true,
              },
            },
          },
        })
      : [];

    return res.json({
      trip,
      totals,
      grouped_by_expense_type,
      linked_advances,
      advances_totals: {
        total_advances_linked,
      },
      balance: {
        remaining: Math.max(0, net),
        shortage: Math.max(0, -net),
        net,
      },
      expenses,
      timeline,
    });
  } catch (error) {
    console.error(error);
    return res.status(error?.statusCode || 500).json({
      message: error?.message || "Failed to generate trip finance report",
      error: error?.message,
    });
  }
}

// =======================================================
// GET /reports/supervisors/:supervisorId/ledger
// =======================================================
async function getSupervisorLedgerReport(req, res) {
  try {
    const companyId = req.companyId;
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { supervisorId } = req.params;
    if (!isUuid(supervisorId)) {
      return res.status(400).json({ message: "Invalid supervisorId" });
    }

    if (!isAccountantOrAdmin(role) && supervisorId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const membership = await getSupervisorMembershipOrThrow(companyId, supervisorId);

    const advances = await prisma.cash_advances.findMany({
      where: {
        company_id: companyId,
        field_supervisor_id: supervisorId,
      },
      orderBy: { created_at: "desc" },
    });

    const advanceIds = advances.map((item) => item.id);

    const expenses = advanceIds.length
      ? await prisma.cash_expenses.findMany({
          where: {
            company_id: companyId,
            cash_advance_id: { in: advanceIds },
            payment_source: "ADVANCE",
          },
        })
      : [];

    const total_advances = advances.reduce(
      (sum, item) => sum + toNumber(item.amount),
      0
    );

    const total_approved = expenses
      .filter((item) => statusBucket(item.approval_status) === "APPROVED")
      .reduce((sum, item) => sum + toNumber(item.amount), 0);

    const net = total_advances - total_approved;

    return res.json({
      supervisor: membership.users,
      membership: {
        id: membership.id,
        company_id: membership.company_id,
        user_id: membership.user_id,
        company_role: membership.company_role,
        status: membership.status,
        is_active: membership.is_active,
        joined_at: membership.joined_at,
      },
      totals: {
        total_advances,
        total_approved,
      },
      balance: {
        remaining: Math.max(0, net),
        shortage: Math.max(0, -net),
        net,
      },
      advances,
    });
  } catch (error) {
    console.error(error);
    return res.status(error?.statusCode || 500).json({
      message: error?.message || "Failed to generate supervisor ledger report",
      error: error?.message,
    });
  }
}

module.exports = {
  getTripFinanceReport,
  getSupervisorLedgerReport,
};