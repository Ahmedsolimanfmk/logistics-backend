const prisma = require("../prisma");
const {
  getUserId,
  isAdminOrAccountant,
} = require("../auth/access");
const tripFinanceService = require("../trips/trip-finance.service");

// =======================
// Helpers
// =======================

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function isTripFinancialLocked(financial_status) {
  const s = String(financial_status || "OPEN").toUpperCase();
  return ["UNDER_REVIEW", "CLOSED"].includes(s);
}

async function assertTripBelongsToSupervisor({
  trip_id,
  userId,
  vehicle_id,
  companyId,
}) {
  const where = {
    company_id: companyId,
    trip_id,
    field_supervisor_id: userId,
  };
  if (vehicle_id) where.vehicle_id = vehicle_id;

  const row = await prisma.trip_assignments.findFirst({
    where,
    orderBy: { assigned_at: "desc" },
    select: { id: true },
  });

  return !!row;
}

async function assertVehicleInSupervisorPortfolio({
  vehicle_id,
  userId,
  companyId,
}) {
  const row = await prisma.vehicle_portfolio.findFirst({
    where: {
      company_id: companyId,
      vehicle_id,
      field_supervisor_id: userId,
      is_active: true,
    },
    select: { id: true },
  });

  return !!row;
}

async function writeExpenseAuditSafe(
  tx,
  { companyId, expense_id, action, actor_id, before, after, notes }
) {
  try {
    if (!tx.cash_expense_audits?.create) return;

    await tx.cash_expense_audits.create({
      data: {
        company_id: companyId,
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

function mapExpenseVendorFields(expense) {
  if (!expense) return expense;
  return {
    ...expense,
    vendor_name: expense.vendor?.name || expense.vendors?.name || null,
  };
}

async function getExpenseOr404(id, companyId, res) {
  const expense = await prisma.cash_expenses.findFirst({
    where: {
      id,
      company_id: companyId,
    },
    include: {
      vendor: {
        select: {
          id: true,
          name: true,
          code: true,
          vendor_type: true,
          classification: true,
          status: true,
        },
      },
    },
  });

  if (!expense) {
    res.status(404).json({ message: "Cash expense not found" });
    return null;
  }

  return expense;
}

async function getExpenseFullOr404(id, companyId, res) {
  const expense = await prisma.cash_expenses.findFirst({
    where: {
      id,
      company_id: companyId,
    },
    include: {
      cash_advance: true,
      trip: true,
      vehicle: true,
      maintenance_work_order: true,
      vendor: true,
      created_by_user: true,
      approved_by_user: true,
      rejected_by_user: true,
      resolved_by_user: true,
      appealed_by_user: true,
    },
  });

  if (!expense) {
    res.status(404).json({ message: "Cash expense not found" });
    return null;
  }
  return expense;
}

function normalizePaymentSource(v) {
  const s = String(v || "ADVANCE").toUpperCase();
  if (["COMPANY", "CO", "DIRECT"].includes(s)) return "COMPANY";
  if (["CASH", "ADVANCE", "ADV"].includes(s)) return "ADVANCE";
  return "ADVANCE";
}

function parseOptionalDate(v) {
  if (!v) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function safeUpper(v) {
  return String(v || "").trim().toUpperCase();
}

function isAdvanceOpenStatus(s) {
  return ["OPEN"].includes(safeUpper(s));
}

function isAdvanceSettledStatus(s) {
  return ["SETTLED"].includes(safeUpper(s));
}

function isAdvanceCancelledStatus(s) {
  return ["CANCELLED", "CANCELED"].includes(safeUpper(s));
}

function normalizePaidMethod(v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;

  const s = safeUpper(v);

  if (["CASH"].includes(s)) return "CASH";
  if (["BANK_TRANSFER", "BANK", "TRANSFER"].includes(s)) return "BANK_TRANSFER";
  if (["CHEQUE", "CHECK"].includes(s)) return "CHEQUE";
  if (["CARD", "POS"].includes(s)) return "CARD";
  if (["WALLET"].includes(s)) return "WALLET";
  if (["OTHER"].includes(s)) return "OTHER";

  return undefined;
}

function normalizeAdvanceSettlementType(v) {
  const s = safeUpper(v);

  if (!s) return null;

  if (["RETURN", "FULL"].includes(s)) return "FULL";
  if (["SHORTAGE", "PARTIAL"].includes(s)) return "PARTIAL";
  if (["ADJUSTMENT", "ADJUSTED"].includes(s)) return "ADJUSTED";
  if (["CANCELLED", "CANCELED"].includes(s)) return "CANCELLED";

  return undefined;
}

// =======================
// Strict relation validators
// =======================

async function ensureCompanyUserMembership(userId, companyId) {
  const row = await prisma.company_users.findFirst({
    where: {
      user_id: userId,
      company_id: companyId,
      is_active: true,
      status: "ACTIVE",
    },
    select: {
      user_id: true,
      role: true,
    },
  });

  return row;
}

async function ensureVendorInCompany(vendorId, companyId) {
  if (!vendorId) return null;

  const vendor = await prisma.vendors.findFirst({
    where: {
      id: vendorId,
      company_id: companyId,
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });

  return vendor;
}

async function ensureTripInCompany(tripId, companyId) {
  if (!tripId) return null;

  const trip = await prisma.trips.findFirst({
    where: {
      id: tripId,
      company_id: companyId,
    },
    select: {
      id: true,
      company_id: true,
      financial_status: true,
      status: true,
    },
  });

  return trip;
}

async function ensureVehicleInCompany(vehicleId, companyId) {
  if (!vehicleId) return null;

  const vehicle = await prisma.vehicles.findFirst({
    where: {
      id: vehicleId,
      company_id: companyId,
    },
    select: {
      id: true,
      company_id: true,
      status: true,
    },
  });

  return vehicle;
}

async function ensureCashAdvanceInCompany(cashAdvanceId, companyId) {
  if (!cashAdvanceId) return null;

  const advance = await prisma.cash_advances.findFirst({
    where: {
      id: cashAdvanceId,
      company_id: companyId,
    },
  });

  return advance;
}

async function ensureMaintenanceWorkOrderInCompany(mwoId, companyId) {
  if (!mwoId) return null;

  const mwo = await prisma.maintenance_work_orders.findFirst({
    where: {
      id: mwoId,
      company_id: companyId,
    },
    select: {
      id: true,
      company_id: true,
      vehicle_id: true,
      vendor_id: true,
      trip_id: true,
      status: true,
    },
  });

  return mwo;
}

// =======================
// Cash Advances
// =======================

async function getCashAdvancesSummary(req, res) {
  try {
    const userId = getUserId(req);
    const companyId = req.companyId;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const isPrivileged = isAdminOrAccountant(req);
    const { status, q } = req.query || {};

    const where = {
      company_id: companyId,
    };

    if (status) where.status = String(status).toUpperCase();

    if (!isPrivileged) {
      where.field_supervisor_id = userId;
    }

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

    const sumAmount = rows.reduce((acc, x) => acc + Number(x.amount || 0), 0);

    const openCount = rows.filter((x) => isAdvanceOpenStatus(x.status)).length;
    const settledCount = rows.filter((x) => isAdvanceSettledStatus(x.status)).length;
    const canceledCount = rows.filter((x) => isAdvanceCancelledStatus(x.status)).length;

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

async function getCashAdvances(req, res) {
  try {
    const userId = getUserId(req);
    const companyId = req.companyId;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const isPrivileged = isAdminOrAccountant(req);
    const { status, q, page = "1", page_size = "50" } = req.query || {};

    const where = {
      company_id: companyId,
    };

    if (status) where.status = String(status).toUpperCase();

    if (!isPrivileged) {
      where.field_supervisor_id = userId;
    }

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
          supervisor_user: true,
          issued_by_user: true,
          cash_expenses: {
            where: { company_id: companyId },
            orderBy: { created_at: "desc" },
            include: {
              vendor: {
                select: { id: true, name: true, code: true },
              },
            },
          },
        },
      }),
      prisma.cash_advances.count({ where }),
    ]);

    return res.json({
      items: items.map((x) => ({
        ...x,
        cash_expenses: (x.cash_expenses || []).map(mapExpenseVendorFields),
      })),
      total,
      page: p,
      page_size: ps,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch cash advances",
      error: e?.message || String(e),
    });
  }
}

async function createCashAdvance(req, res) {
  try {
    const issuerId = getUserId(req);
    const companyId = req.companyId;

    if (!issuerId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({ message: "Only ADMIN or ACCOUNTANT can issue cash advances" });
    }

    const { field_supervisor_id, amount } = req.body || {};

    if (!isUuid(field_supervisor_id)) {
      return res.status(400).json({
        message: "field_supervisor_id is required and must be uuid",
      });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "amount must be greater than 0" });
    }

    const supervisorMembership = await ensureCompanyUserMembership(
      field_supervisor_id,
      companyId
    );

    if (!supervisorMembership) {
      return res.status(400).json({
        message: "Invalid field_supervisor_id for current company",
      });
    }

    const created = await prisma.cash_advances.create({
      data: {
        company_id: companyId,
        amount,
        status: "OPEN",
        supervisor_user: {
          connect: { id: field_supervisor_id },
        },
        issued_by_user: {
          connect: { id: issuerId },
        },
      },
      include: {
        supervisor_user: true,
        issued_by_user: true,
      },
    });

    return res.status(201).json(created);
  } catch (e) {
    return res.status(500).json({
      message: "Failed to create cash advance",
      error: e?.message || String(e),
    });
  }
}

async function submitCashAdvanceForReview(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ADMIN or ACCOUNTANT can submit advance for review",
      });
    }

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid cash advance id" });

    const advance = await prisma.cash_advances.findFirst({
      where: {
        id,
        company_id: companyId,
      },
    });

    if (!advance) return res.status(404).json({ message: "Cash advance not found" });

    const st = safeUpper(advance.status || "OPEN");
    if (st === "SETTLED") {
      return res.status(409).json({ message: "Cash advance already SETTLED" });
    }
    if (st !== "OPEN") {
      return res.status(400).json({
        message: `Cash advance must be OPEN to submit review (current: ${st})`,
      });
    }

    return res.json({
      message: "Cash advance ready for review",
      review_status: "READY_FOR_REVIEW",
      cash_advance: advance,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to submit cash advance for review",
      error: e?.message || String(e),
    });
  }
}

async function closeCashAdvance(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ADMIN or ACCOUNTANT can close cash advances",
      });
    }

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid cash advance id" });

    const { settlement_type, amount, reference, notes } = req.body || {};
    const stType = normalizeAdvanceSettlementType(settlement_type);

    if (stType === undefined) {
      return res.status(400).json({
        message:
          "settlement_type must be FULL | PARTIAL | ADJUSTED | CANCELLED (legacy RETURN/SHORTAGE/ADJUSTMENT also accepted)",
      });
    }

    if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) < 0) {
      return res.status(400).json({ message: "amount must be a number >= 0" });
    }

    const advance = await prisma.cash_advances.findFirst({
      where: {
        id,
        company_id: companyId,
      },
    });

    if (!advance) return res.status(404).json({ message: "Cash advance not found" });

    const st = safeUpper(advance.status || "OPEN");
    if (st === "SETTLED") return res.status(409).json({ message: "Cash advance already SETTLED" });
    if (st !== "OPEN") {
      return res.status(400).json({
        message: `Cash advance must be OPEN before settlement (current: ${st})`,
      });
    }

    const pendingCount = await prisma.cash_expenses.count({
      where: {
        company_id: companyId,
        cash_advance_id: id,
        approval_status: { in: ["PENDING", "APPEALED"] },
      },
    });

    if (pendingCount > 0) {
      return res.status(409).json({
        message: "Cannot settle cash advance while there are pending/appealed expenses",
        pending_count: pendingCount,
      });
    }

    const approvedExpenses = await prisma.cash_expenses.findMany({
      where: {
        company_id: companyId,
        cash_advance_id: id,
        approval_status: "APPROVED",
      },
      select: { amount: true },
    });

    const totalApproved = approvedExpenses.reduce((acc, x) => acc + Number(x.amount || 0), 0);
    const advanceAmount = Number(advance.amount || 0);

    const remaining = advanceAmount - totalApproved;
    const shortage = totalApproved - advanceAmount;
    const amt = Number(amount);

    if (stType === "FULL") {
      if (remaining < 0) {
        return res.status(400).json({
          message: "Cannot use FULL settlement when there is a shortage. Use PARTIAL or ADJUSTED.",
          totals: { advanceAmount, totalApproved, remaining, shortage },
        });
      }
      if (Number(remaining.toFixed(2)) !== Number(amt.toFixed(2))) {
        return res.status(400).json({
          message: "For FULL settlement, amount must equal remaining exactly",
          totals: { advanceAmount, totalApproved, remaining },
        });
      }
    }

    if (stType === "PARTIAL") {
      if (shortage <= 0) {
        return res.status(400).json({
          message: "No shortage detected. Use FULL or ADJUSTED.",
          totals: { advanceAmount, totalApproved, remaining, shortage },
        });
      }
      if (Number(shortage.toFixed(2)) !== Number(amt.toFixed(2))) {
        return res.status(400).json({
          message: "For PARTIAL settlement, amount must equal shortage exactly",
          totals: { advanceAmount, totalApproved, shortage },
        });
      }
    }

    const updated = await prisma.cash_advances.update({
      where: { id },
      data: {
        status: "SETTLED",
        settlement_type: stType,
        settlement_amount: amt,
        settlement_reference: reference ? String(reference) : null,
        settlement_notes: notes ? String(notes) : null,
        settled_at: new Date(),
        settled_by: actorId,
      },
    });

    return res.json({
      message: "Cash advance SETTLED",
      cash_advance: updated,
      totals: { advanceAmount, totalApproved, remaining, shortage },
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to settle cash advance",
      error: e?.message || String(e),
    });
  }
}

async function reopenCashAdvance(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ADMIN or ACCOUNTANT can reopen cash advances",
      });
    }

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid cash advance id" });

    const advance = await prisma.cash_advances.findFirst({
      where: {
        id,
        company_id: companyId,
      },
    });

    if (!advance) return res.status(404).json({ message: "Cash advance not found" });

    const st = safeUpper(advance.status || "OPEN");
    if (st !== "SETTLED") {
      return res.status(400).json({
        message: `Only SETTLED advances can be reopened (current: ${st})`,
      });
    }

    const updated = await prisma.cash_advances.update({
      where: { id },
      data: {
        status: "OPEN",
        settlement_type: null,
        settlement_amount: null,
        settlement_reference: null,
        settlement_notes: null,
        settled_at: null,
        settled_by: null,
      },
    });

    return res.json({
      message: "Cash advance reopened to OPEN",
      cash_advance: updated,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to reopen cash advance",
      error: e?.message || String(e),
    });
  }
}

async function getAdvanceExpenses(req, res) {
  try {
    const companyId = req.companyId;
    const { id } = req.params;
    const { status } = req.query;

    if (!isUuid(id)) return res.status(400).json({ message: "Invalid cash advance id" });

    const advance = await prisma.cash_advances.findFirst({
      where: {
        id,
        company_id: companyId,
      },
    });

    if (!advance) return res.status(404).json({ message: "Cash advance not found" });

    const where = {
      company_id: companyId,
      cash_advance_id: id,
    };
    if (status) where.approval_status = String(status).toUpperCase();

    const list = await prisma.cash_expenses.findMany({
      where,
      orderBy: { created_at: "desc" },
      include: {
        created_by_user: true,
        approved_by_user: true,
        trip: true,
        vehicle: true,
        vendor: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return res.json(list.map(mapExpenseVendorFields));
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch advance expenses",
      error: e?.message || String(e),
    });
  }
}

// =======================
// Cash Expenses
// =======================

async function createCashExpense(req, res) {
  try {
    const userId = getUserId(req);
    const companyId = req.companyId;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const {
      expense_source,
      payment_source,
      cash_advance_id,
      trip_id,
      vehicle_id,
      maintenance_work_order_id,
      vendor_id,
      expense_type,
      amount,
      notes,
      receipt_url,
      invoice_no,
      invoice_date,
      paid_method,
      payment_ref,
      vat_amount,
      invoice_total,
    } = req.body || {};

    const src = normalizePaymentSource(payment_source || expense_source);

    if (!expense_type) {
      return res.status(400).json({ message: "expense_type is required" });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: "amount must be > 0" });
    }

    if (trip_id && !isUuid(trip_id)) {
      return res.status(400).json({ message: "Invalid trip_id" });
    }
    if (vehicle_id && !isUuid(vehicle_id)) {
      return res.status(400).json({ message: "Invalid vehicle_id" });
    }
    if (maintenance_work_order_id && !isUuid(maintenance_work_order_id)) {
      return res.status(400).json({ message: "Invalid maintenance_work_order_id" });
    }

    let normalizedVendorId = null;
    if (vendor_id !== undefined && vendor_id !== null && String(vendor_id).trim() !== "") {
      if (!isUuid(String(vendor_id))) {
        return res.status(400).json({ message: "Invalid vendor_id" });
      }

      const vendor = await ensureVendorInCompany(String(vendor_id), companyId);
      if (!vendor) {
        return res.status(400).json({ message: "Invalid vendor_id" });
      }

      normalizedVendorId = vendor.id;
    }

    let validatedTrip = null;
    if (trip_id) {
      validatedTrip = await ensureTripInCompany(trip_id, companyId);
      if (!validatedTrip) {
        return res.status(400).json({ message: "Invalid trip_id" });
      }

      if (isTripFinancialLocked(validatedTrip.financial_status)) {
        return res.status(409).json({
          message: `Trip is financially locked (${validatedTrip.financial_status}). No more expenses allowed.`,
        });
      }
    }

    let validatedVehicle = null;
    if (vehicle_id) {
      validatedVehicle = await ensureVehicleInCompany(vehicle_id, companyId);
      if (!validatedVehicle) {
        return res.status(400).json({ message: "Invalid vehicle_id" });
      }
    }

    let validatedMwo = null;
    let mwoVehicleId = null;
    if (maintenance_work_order_id) {
      validatedMwo = await ensureMaintenanceWorkOrderInCompany(
        maintenance_work_order_id,
        companyId
      );

      if (!validatedMwo) {
        return res.status(400).json({ message: "Invalid maintenance_work_order_id" });
      }

      mwoVehicleId = validatedMwo.vehicle_id || null;

      if (validatedMwo.vendor_id) {
        const mwoVendor = await ensureVendorInCompany(validatedMwo.vendor_id, companyId);
        if (!mwoVendor) {
          return res.status(400).json({
            message: "maintenance_work_order vendor is invalid for current company",
          });
        }
      }

      if (!normalizedVendorId && validatedMwo.vendor_id) {
        normalizedVendorId = validatedMwo.vendor_id;
      }

      if (validatedMwo.trip_id && trip_id && validatedMwo.trip_id !== trip_id) {
        return res.status(400).json({
          message: "maintenance_work_order_id does not belong to trip_id",
        });
      }

      if (validatedMwo.vehicle_id && vehicle_id && validatedMwo.vehicle_id !== vehicle_id) {
        return res.status(400).json({
          message: "maintenance_work_order_id does not belong to vehicle_id",
        });
      }
    }

    if (src === "COMPANY") {
      if (!isAdminOrAccountant(req)) {
        return res.status(403).json({
          message: "Only ADMIN or ACCOUNTANT can create COMPANY expenses",
        });
      }

      if (cash_advance_id) {
        return res.status(400).json({
          message: "cash_advance_id must be omitted for COMPANY expenses",
        });
      }

      if (!normalizedVendorId) {
        return res.status(400).json({
          message: "vendor_id is required for COMPANY expenses",
        });
      }

      const invDate = parseOptionalDate(invoice_date);
      if (invDate === undefined) {
        return res.status(400).json({ message: "Invalid invoice_date" });
      }

      const normalizedPaidMethod = normalizePaidMethod(paid_method);
      if (normalizedPaidMethod === undefined) {
        return res.status(400).json({
          message: "Invalid paid_method. Allowed: CASH | BANK_TRANSFER | CHEQUE | CARD | WALLET | OTHER",
        });
      }

      const finalVehicleId = vehicle_id || mwoVehicleId || null;

      if (trip_id && !validatedTrip) {
        return res.status(400).json({ message: "Invalid trip_id" });
      }

      if (finalVehicleId) {
        const finalVehicle = await ensureVehicleInCompany(finalVehicleId, companyId);
        if (!finalVehicle) {
          return res.status(400).json({ message: "Invalid vehicle_id" });
        }
      }

      const created = await prisma.cash_expenses.create({
        data: {
          company_id: companyId,
          payment_source: "COMPANY",
          cash_advance_id: null,
          vendor_id: normalizedVendorId,

          trip: trip_id ? { connect: { id: trip_id } } : undefined,
          vehicle: finalVehicleId ? { connect: { id: finalVehicleId } } : undefined,
          maintenance_work_order: maintenance_work_order_id
            ? { connect: { id: maintenance_work_order_id } }
            : undefined,
          vendor: normalizedVendorId ? { connect: { id: normalizedVendorId } } : undefined,

          expense_type,
          amount,
          notes: notes ? String(notes) : null,
          receipt_url: receipt_url ? String(receipt_url) : null,

          invoice_no: invoice_no ? String(invoice_no).trim() : null,
          invoice_date: invDate,
          paid_method: normalizedPaidMethod,
          payment_ref: payment_ref ? String(payment_ref) : null,
          vat_amount: vat_amount !== undefined && vat_amount !== null ? vat_amount : null,
          invoice_total: invoice_total !== undefined && invoice_total !== null ? invoice_total : null,

          approval_status: "PENDING",
          created_by_user: { connect: { id: userId } },
        },
        include: {
          vendor: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      return res.status(201).json(mapExpenseVendorFields(created));
    }

    if (!isUuid(cash_advance_id)) {
      return res.status(400).json({
        message: "cash_advance_id is required for ADVANCE expenses and must be uuid",
      });
    }

    const advance = await ensureCashAdvanceInCompany(cash_advance_id, companyId);

    if (!advance || !isAdvanceOpenStatus(advance.status)) {
      return res.status(400).json({ message: "Cash advance not found or not OPEN" });
    }

    if (advance.field_supervisor_id !== userId) {
      return res.status(403).json({
        message: "Only the assigned field supervisor can add ADVANCE expenses",
      });
    }

    if (trip_id) {
      const okTrip = await assertTripBelongsToSupervisor({
        trip_id,
        userId,
        vehicle_id: vehicle_id || null,
        companyId,
      });

      if (!okTrip) {
        return res.status(403).json({
          message: "You are not allowed to add expenses to this trip (not assigned to you).",
        });
      }
    }

    if (!trip_id && vehicle_id) {
      const okVehicle = await assertVehicleInSupervisorPortfolio({
        vehicle_id,
        userId,
        companyId,
      });

      if (!okVehicle) {
        return res.status(403).json({
          message: "You are not allowed to add expenses to this vehicle (not in your portfolio).",
        });
      }
    }

    const finalVehicleId = vehicle_id || mwoVehicleId || null;

    if (finalVehicleId) {
      const finalVehicle = await ensureVehicleInCompany(finalVehicleId, companyId);
      if (!finalVehicle) {
        return res.status(400).json({ message: "Invalid vehicle_id" });
      }
    }

    const created = await prisma.cash_expenses.create({
      data: {
        company_id: companyId,
        payment_source: "ADVANCE",
        cash_advance: { connect: { id: cash_advance_id } },
        vendor_id: normalizedVendorId,

        trip: trip_id ? { connect: { id: trip_id } } : undefined,
        vehicle: finalVehicleId ? { connect: { id: finalVehicleId } } : undefined,
        maintenance_work_order: maintenance_work_order_id
          ? { connect: { id: maintenance_work_order_id } }
          : undefined,
        vendor: normalizedVendorId ? { connect: { id: normalizedVendorId } } : undefined,

        expense_type,
        amount,
        notes: notes ? String(notes) : null,
        receipt_url: receipt_url ? String(receipt_url) : null,

        approval_status: "PENDING",
        created_by_user: { connect: { id: userId } },
      },
      include: {
        vendor: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return res.status(201).json(mapExpenseVendorFields(created));
  } catch (e) {
    return res.status(500).json({
      message: "Failed to create cash expense",
      error: e?.message || String(e),
    });
  }
}

async function listCashExpenses(req, res) {
  try {
    const userId = getUserId(req);
    const companyId = req.companyId;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const isPrivileged = isAdminOrAccountant(req);
    const { status, payment_source, q, vendor_id, page = "1", page_size = "50" } = req.query || {};

    const where = {
      company_id: companyId,
    };

    if (status) where.approval_status = String(status).toUpperCase();
    if (payment_source) where.payment_source = normalizePaymentSource(payment_source);

    if (vendor_id) {
      if (!isUuid(String(vendor_id))) {
        return res.status(400).json({ message: "Invalid vendor_id" });
      }
      where.vendor_id = String(vendor_id);
    }

    if (!isPrivileged) {
      where.created_by = userId;
    }

    if (q && String(q).trim()) {
      const qq = String(q).trim();
      where.OR = [
        { expense_type: { contains: qq, mode: "insensitive" } },
        { notes: { contains: qq, mode: "insensitive" } },
        { invoice_no: { contains: qq, mode: "insensitive" } },
        { payment_ref: { contains: qq, mode: "insensitive" } },
        {
          vendor: {
            is: {
              name: { contains: qq, mode: "insensitive" },
            },
          },
        },
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
          cash_advance: true,
          trip: true,
          vehicle: true,
          maintenance_work_order: true,
          vendor: {
            select: {
              id: true,
              name: true,
              code: true,
              vendor_type: true,
              classification: true,
              status: true,
            },
          },
          created_by_user: true,
          approved_by_user: true,
        },
      }),
      prisma.cash_expenses.count({ where }),
    ]);

    return res.json({
      items: items.map(mapExpenseVendorFields),
      total,
      page: p,
      page_size: ps,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch expenses",
      error: e?.message || String(e),
    });
  }
}

async function getCashAdvanceById(req, res) {
  try {
    const userId = getUserId(req);
    const companyId = req.companyId;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params || {};
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid cash advance id" });

    const row = await prisma.cash_advances.findFirst({
      where: {
        id,
        company_id: companyId,
      },
      include: {
        supervisor_user: true,
        issued_by_user: true,
        cash_expenses: {
          where: { company_id: companyId },
          orderBy: { created_at: "desc" },
          include: {
            vendor: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
    });

    if (!row) return res.status(404).json({ message: "Cash advance not found" });

    const isPrivileged = isAdminOrAccountant(req);
    const isOwnerSupervisor = row.field_supervisor_id === userId;

    if (!isPrivileged && !isOwnerSupervisor) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.json({
      ...row,
      cash_expenses: (row.cash_expenses || []).map(mapExpenseVendorFields),
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch cash advance",
      error: e?.message || String(e),
    });
  }
}

async function getCashExpensesSummary(req, res) {
  try {
    const userId = getUserId(req);
    const companyId = req.companyId;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const isPrivileged = isAdminOrAccountant(req);
    const { status, payment_source, q, vendor_id } = req.query || {};
    const where = {
      company_id: companyId,
    };

    if (status) where.approval_status = String(status).toUpperCase();
    if (payment_source) where.payment_source = normalizePaymentSource(payment_source);

    if (vendor_id) {
      if (!isUuid(String(vendor_id))) {
        return res.status(400).json({ message: "Invalid vendor_id" });
      }
      where.vendor_id = String(vendor_id);
    }

    if (!isPrivileged) {
      where.created_by = userId;
    }

    if (q && String(q).trim()) {
      const qq = String(q).trim();
      where.OR = [
        { expense_type: { contains: qq, mode: "insensitive" } },
        { notes: { contains: qq, mode: "insensitive" } },
        { invoice_no: { contains: qq, mode: "insensitive" } },
        { payment_ref: { contains: qq, mode: "insensitive" } },
        {
          vendor: {
            is: {
              name: { contains: qq, mode: "insensitive" },
            },
          },
        },
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

    const sumApproved = pick("APPROVED");
    const countApproved = pickCount("APPROVED");

    return res.json({
      where_applied: {
        status: status ? String(status).toUpperCase() : null,
        payment_source: payment_source ? normalizePaymentSource(payment_source) : null,
        vendor_id: vendor_id ? String(vendor_id) : null,
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
        sumResolved: pick("RESOLVED"),
        countResolved: pickCount("RESOLVED"),
      },
      raw_by_status: groups.map((g) => ({
        approval_status: String(g.approval_status || "").toUpperCase(),
        sum: Number(g._sum?.amount || 0),
        count: Number(g._count?._all || 0),
      })),
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch expenses summary",
      error: e?.message || String(e),
    });
  }
}

async function getCashExpenseById(req, res) {
  try {
    const userId = getUserId(req);
    const companyId = req.companyId;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params || {};
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid expense id" });

    const row = await prisma.cash_expenses.findFirst({
      where: {
        id,
        company_id: companyId,
      },
      include: {
        cash_advance: true,
        trip: true,
        vehicle: true,
        maintenance_work_order: true,
        vendor: true,
        created_by_user: true,
        approved_by_user: true,
        rejected_by_user: true,
        resolved_by_user: true,
        appealed_by_user: true,
      },
    });

    if (!row) return res.status(404).json({ message: "Cash expense not found" });

    const isPrivileged = isAdminOrAccountant(req);
    const isOwner = row.created_by === userId;
    const isAdvanceSupervisor = row.cash_advance?.field_supervisor_id === userId;

    if (!isPrivileged && !isOwner && !isAdvanceSupervisor) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.json(mapExpenseVendorFields(row));
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch expense",
      error: e?.message || String(e),
    });
  }
}

async function approveCashExpense(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ADMIN or ACCOUNTANT can approve expenses",
      });
    }

    const { id } = req.params || {};
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid expense id" });

    const notes = req.body?.notes ? String(req.body.notes) : null;

    const expense = await getExpenseOr404(id, companyId, res);
    if (!expense) return;

    const st = safeUpper(expense.approval_status);
    if (!["PENDING", "APPEALED"].includes(st)) {
      return res.status(400).json({
        message: `Expense must be PENDING or APPEALED to approve (current: ${st})`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const before = expense;

      const after = await tx.cash_expenses.update({
        where: { id },
        data: {
          approval_status: "APPROVED",
          approved_at: new Date(),
          approved_by: actorId,
          rejected_at: null,
          rejected_by: null,
          rejection_reason: null,
          resolved_at: st === "APPEALED" ? new Date() : expense.resolved_at,
          resolved_by: st === "APPEALED" ? actorId : expense.resolved_by,
          appeal_status: st === "APPEALED" ? "ACCEPTED" : expense.appeal_status,
        },
        include: {
          vendor: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      await writeExpenseAuditSafe(tx, {
        companyId,
        expense_id: id,
        action: st === "APPEALED" ? "APPROVE_APPEAL" : "APPROVE",
        actor_id: actorId,
        before,
        after,
        notes,
      });

      return after;
    });

    return res.json({ message: "Expense approved", expense: mapExpenseVendorFields(updated) });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to approve expense",
      error: e?.message || String(e),
    });
  }
}

async function rejectCashExpense(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ADMIN or ACCOUNTANT can reject expenses",
      });
    }

    const { id } = req.params || {};
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid expense id" });

    const reason = req.body?.reason
      ? String(req.body.reason)
      : req.body?.notes
      ? String(req.body.notes)
      : null;

    const expense = await getExpenseOr404(id, companyId, res);
    if (!expense) return;

    const st = safeUpper(expense.approval_status);
    if (!["PENDING", "APPEALED"].includes(st)) {
      return res.status(400).json({
        message: `Expense must be PENDING or APPEALED to reject (current: ${st})`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const before = expense;

      const after = await tx.cash_expenses.update({
        where: { id },
        data: {
          approval_status: "REJECTED",
          rejected_at: new Date(),
          rejected_by: actorId,
          rejection_reason: reason,
          resolved_at: st === "APPEALED" ? new Date() : expense.resolved_at,
          resolved_by: st === "APPEALED" ? actorId : expense.resolved_by,
          appeal_status: st === "APPEALED" ? "REJECTED" : expense.appeal_status,
        },
        include: {
          vendor: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      await writeExpenseAuditSafe(tx, {
        companyId,
        expense_id: id,
        action: "REJECT",
        actor_id: actorId,
        before,
        after,
        notes: reason,
      });

      return after;
    });

    return res.json({ message: "Expense rejected", expense: mapExpenseVendorFields(updated) });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to reject expense",
      error: e?.message || String(e),
    });
  }
}

async function appealRejectedExpense(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params || {};
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid expense id" });

    const appeal_reason = req.body?.reason
      ? String(req.body.reason)
      : req.body?.notes
      ? String(req.body.notes)
      : null;

    const expense = await getExpenseFullOr404(id, companyId, res);
    if (!expense) return;

    const st = safeUpper(expense.approval_status);
    if (st !== "REJECTED") {
      return res.status(400).json({
        message: `Only REJECTED expenses can be appealed (current: ${st})`,
      });
    }

    const isPrivileged = isAdminOrAccountant(req);
    const isOwner = expense.created_by === actorId;
    const isAdvanceSupervisor = expense.cash_advance?.field_supervisor_id === actorId;

    if (!isPrivileged && !isOwner && !isAdvanceSupervisor) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const before = expense;

      const after = await tx.cash_expenses.update({
        where: { id },
        data: {
          approval_status: "APPEALED",
          appealed_at: new Date(),
          appealed_by: actorId,
          appeal_reason,
          appeal_status: "OPEN",
          resolved_at: null,
          resolved_by: null,
        },
        include: {
          vendor: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      await writeExpenseAuditSafe(tx, {
        companyId,
        expense_id: id,
        action: "APPEAL",
        actor_id: actorId,
        before,
        after,
        notes: appeal_reason,
      });

      return after;
    });

    return res.json({ message: "Appeal submitted", expense: mapExpenseVendorFields(updated) });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to appeal rejected expense",
      error: e?.message || String(e),
    });
  }
}

async function resolveAppeal(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ADMIN or ACCOUNTANT can resolve appeals",
      });
    }

    const { id } = req.params || {};
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid expense id" });

    const decision = safeUpper(req.body?.decision);
    const notes = req.body?.notes ? String(req.body.notes) : null;

    if (!["APPROVE", "REJECT"].includes(decision)) {
      return res.status(400).json({ message: "decision must be APPROVE | REJECT" });
    }

    const expense = await getExpenseOr404(id, companyId, res);
    if (!expense) return;

    const st = safeUpper(expense.approval_status);
    if (st !== "APPEALED") {
      return res.status(400).json({
        message: `Expense must be APPEALED to resolve (current: ${st})`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const before = expense;

      let after;
      if (decision === "APPROVE") {
        after = await tx.cash_expenses.update({
          where: { id },
          data: {
            approval_status: "APPROVED",
            approved_at: new Date(),
            approved_by: actorId,
            rejected_at: null,
            rejected_by: null,
            rejection_reason: null,
            resolved_at: new Date(),
            resolved_by: actorId,
            appeal_status: "ACCEPTED",
          },
          include: {
            vendor: {
              select: { id: true, name: true, code: true },
            },
          },
        });
      } else {
        after = await tx.cash_expenses.update({
          where: { id },
          data: {
            approval_status: "REJECTED",
            rejected_at: new Date(),
            rejected_by: actorId,
            rejection_reason: notes,
            resolved_at: new Date(),
            resolved_by: actorId,
            appeal_status: "REJECTED",
          },
          include: {
            vendor: {
              select: { id: true, name: true, code: true },
            },
          },
        });
      }

      await writeExpenseAuditSafe(tx, {
        companyId,
        expense_id: id,
        action: decision === "APPROVE" ? "RESOLVE_APPEAL_APPROVE" : "RESOLVE_APPEAL_REJECT",
        actor_id: actorId,
        before,
        after,
        notes,
      });

      return after;
    });

    return res.json({ message: "Appeal resolved", expense: mapExpenseVendorFields(updated) });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to resolve appeal",
      error: e?.message || String(e),
    });
  }
}

async function reopenRejectedExpense(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ADMIN or ACCOUNTANT can reopen rejected expenses",
      });
    }

    const { id } = req.params || {};
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid expense id" });

    const expense = await getExpenseOr404(id, companyId, res);
    if (!expense) return;

    const st = safeUpper(expense.approval_status);
    if (st !== "REJECTED") {
      return res.status(400).json({
        message: `Only REJECTED expenses can be reopened (current: ${st})`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const before = expense;

      const after = await tx.cash_expenses.update({
        where: { id },
        data: {
          approval_status: "PENDING",
          rejected_at: null,
          rejected_by: null,
          rejection_reason: null,
          appealed_at: null,
          appealed_by: null,
          appeal_reason: null,
          appeal_status: null,
          resolved_at: null,
          resolved_by: null,
        },
        include: {
          vendor: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      await writeExpenseAuditSafe(tx, {
        companyId,
        expense_id: id,
        action: "REOPEN",
        actor_id: actorId,
        before,
        after,
        notes: req.body?.notes ? String(req.body.notes) : null,
      });

      return after;
    });

    return res.json({ message: "Expense reopened to PENDING", expense: mapExpenseVendorFields(updated) });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to reopen expense",
      error: e?.message || String(e),
    });
  }
}

async function getExpenseAudit(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });

    const { id } = req.params || {};
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid expense id" });

    const expense = await getExpenseFullOr404(id, companyId, res);
    if (!expense) return;

    const isPrivileged = isAdminOrAccountant(req);
    const isOwner = expense.created_by === actorId;
    const isAdvanceSupervisor = expense.cash_advance?.field_supervisor_id === actorId;

    if (!isPrivileged && !isOwner && !isAdvanceSupervisor) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!prisma.cash_expense_audits?.findMany) {
      return res.json({
        items: [],
        note: "cash_expense_audits table not available in prisma schema",
      });
    }

    const items = await prisma.cash_expense_audits.findMany({
      where: {
        company_id: companyId,
        expense_id: id,
      },
      orderBy: { created_at: "desc" },
    });

    return res.json({ items });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch expense audit",
      error: e?.message || String(e),
    });
  }
}

async function getSupervisorDeficitReport(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ADMIN or ACCOUNTANT can view this report",
      });
    }

    const status = req.query?.status ? safeUpper(req.query.status) : null;

    const whereAdv = {
      company_id: companyId,
    };
    if (status) whereAdv.status = status;

    const advances = await prisma.cash_advances.findMany({
      where: whereAdv,
      include: {
        supervisor_user: true,
      },
      orderBy: { created_at: "desc" },
      take: 2000,
    });

    const ids = advances.map((a) => a.id);

    const expenses = ids.length
      ? await prisma.cash_expenses.findMany({
          where: {
            company_id: companyId,
            cash_advance_id: { in: ids },
            approval_status: "APPROVED",
          },
          select: { cash_advance_id: true, amount: true },
        })
      : [];

    const sumByAdvance = new Map();
    for (const e of expenses) {
      const k = e.cash_advance_id;
      sumByAdvance.set(k, (sumByAdvance.get(k) || 0) + Number(e.amount || 0));
    }

    const items = advances.map((a) => {
      const advanceAmount = Number(a.amount || 0);
      const approvedSpent = Number(sumByAdvance.get(a.id) || 0);
      const remaining = advanceAmount - approvedSpent;
      const shortage = approvedSpent - advanceAmount;

      return {
        cash_advance_id: a.id,
        supervisor_id: a.field_supervisor_id,
        supervisor_name: a.supervisor_user?.full_name || null,
        status: a.status,
        advance_amount: advanceAmount,
        approved_spent: approvedSpent,
        remaining: Number(remaining.toFixed(2)),
        shortage: Number(shortage > 0 ? shortage.toFixed(2) : 0),
        created_at: a.created_at,
      };
    });

    return res.json({
      items,
      total: items.length,
      where_applied: { status: status || null },
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch deficit report",
      error: e?.message || String(e),
    });
  }
}

// =======================
// Trip Finance
// =======================

async function openTripFinanceReview(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ADMIN or ACCOUNTANT can open trip finance review",
      });
    }

    const trip_id = String(req.params?.id || req.params?.trip_id || "").trim();
    if (!isUuid(trip_id)) return res.status(400).json({ message: "Invalid trip_id" });

    const trip = await prisma.trips.findFirst({
      where: {
        id: trip_id,
        company_id: companyId,
      },
      select: { id: true, financial_status: true },
    });

    if (!trip) return res.status(404).json({ message: "Trip not found" });

    const st = safeUpper(trip.financial_status || "OPEN");
    if (st === "CLOSED") {
      return res.status(409).json({ message: "Trip finance already CLOSED" });
    }

    const updated = await prisma.trips.update({
      where: { id: trip_id },
      data: {
        financial_status: "UNDER_REVIEW",
        financial_review_opened_at: new Date(),
      },
    });

    return res.json({
      message: "Trip finance moved to UNDER_REVIEW",
      trip: updated,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to open trip finance review",
      error: e?.message || String(e),
    });
  }
}

async function closeTripFinance(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });
    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ADMIN or ACCOUNTANT can close trip finance",
      });
    }

    const trip_id = String(req.params?.id || req.params?.trip_id || "").trim();
    if (!isUuid(trip_id)) return res.status(400).json({ message: "Invalid trip_id" });

    const trip = await prisma.trips.findFirst({
      where: {
        id: trip_id,
        company_id: companyId,
      },
      select: {
        id: true,
        financial_status: true,
      },
    });

    if (!trip) return res.status(404).json({ message: "Trip not found" });

    const st = safeUpper(trip.financial_status || "OPEN");
    if (st !== "UNDER_REVIEW") {
      return res.status(400).json({
        message: `Trip must be UNDER_REVIEW to close finance (current: ${st})`,
      });
    }

    const [pendingExpenseCount, currentRevenue, currentApprovedRevenue] = await Promise.all([
      prisma.cash_expenses.count({
        where: {
          company_id: companyId,
          trip_id,
          approval_status: { in: ["PENDING", "APPEALED"] },
        },
      }),
      prisma.trip_revenues.findFirst({
        where: {
          company_id: companyId,
          trip_id,
          is_current: true,
        },
        select: {
          id: true,
          is_current: true,
          is_approved: true,
          version_no: true,
          amount: true,
          currency: true,
        },
      }),
      prisma.trip_revenues.findFirst({
        where: {
          company_id: companyId,
          trip_id,
          is_current: true,
          is_approved: true,
        },
        select: {
          id: true,
          is_current: true,
          is_approved: true,
          version_no: true,
          amount: true,
          currency: true,
        },
      }),
    ]);

    if (pendingExpenseCount > 0) {
      return res.status(409).json({
        message: "Cannot close trip finance while there are pending/appealed expenses",
        pending_expense_count: pendingExpenseCount,
      });
    }

    if (!currentRevenue) {
      return res.status(409).json({
        message: "Cannot close trip finance without a current revenue record",
      });
    }

    if (!currentApprovedRevenue) {
      return res.status(409).json({
        message: "Cannot close trip finance until current revenue is approved",
        current_revenue: currentRevenue,
      });
    }

    const updated = await prisma.trips.update({
      where: { id: trip_id },
      data: {
        financial_status: "CLOSED",
        financial_closed_at: new Date(),
        financial_closed_by: actorId,
      },
    });

    return res.json({
      message: "Trip finance CLOSED",
      trip: updated,
      current_revenue: currentApprovedRevenue,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to close trip finance",
      error: e?.message || String(e),
    });
  }
}

async function getTripFinanceSummary(req, res) {
  try {
    const actorId = getUserId(req);
    const companyId = req.companyId;

    if (!actorId) return res.status(401).json({ message: "Unauthorized" });

    const isPrivileged = isAdminOrAccountant(req);

    const trip_id = req.params?.id
      ? String(req.params.id)
      : req.query?.trip_id
      ? String(req.query.trip_id)
      : null;

    if (!trip_id) {
      return res.status(400).json({ message: "trip_id is required" });
    }

    if (!isUuid(trip_id)) {
      return res.status(400).json({ message: "Invalid trip_id" });
    }

    if (!isPrivileged) {
      const allowed = await assertTripBelongsToSupervisor({
        trip_id,
        userId: actorId,
        companyId,
      });

      if (!allowed) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const data = await tripFinanceService.getTripFinanceSummary(trip_id, companyId);

    return res.json({
      success: true,
      data,
    });
  } catch (e) {
    return res.status(e.statusCode || 500).json({
      success: false,
      message: e?.message || "Failed to fetch trip finance summary",
    });
  }
}

module.exports = {
  getCashAdvancesSummary,
  getCashAdvances,
  getCashAdvanceById,
  createCashAdvance,
  submitCashAdvanceForReview,
  closeCashAdvance,
  reopenCashAdvance,
  getAdvanceExpenses,

  createCashExpense,
  listCashExpenses,
  getCashExpensesSummary,
  getCashExpenseById,
  approveCashExpense,
  rejectCashExpense,
  appealRejectedExpense,
  resolveAppeal,
  reopenRejectedExpense,

  getSupervisorDeficitReport,
  getExpenseAudit,

  openTripFinanceReview,
  closeTripFinance,
  getTripFinanceSummary,
};