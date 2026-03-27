const prisma = require("../prisma");
const { ROLES } = require("../auth/roles");
const tripFinanceService = require("./trip-finance.service");
const tripRevenuesService = require("../trip-revenues/trip-revenues.service");

// =======================
// Helpers
// =======================
function getAuthUserId(req) {
  return req.user?.sub || req.user?.id || null;
}

function getAuthRole(req) {
  return String(req.user?.role || "").toUpperCase();
}

function canViewAllTrips(role) {
  return [
    ROLES.ADMIN,
    ROLES.OPERATIONS,
    ROLES.GENERAL_SUPERVISOR,
    ROLES.DEPT_MANAGER,
    ROLES.GENERAL_MANAGER,
    ROLES.GENERAL_RESPONSIBLE,
  ].includes(role);
}

function canAccessTrips(role) {
  return canViewAllTrips(role) || role === ROLES.FIELD_SUPERVISOR;
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function parseStatusList(raw) {
  if (!raw) return null;
  const s = String(raw)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return s.length ? s : null;
}

function dayRangeLocal(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function isExpiredDate(d) {
  if (!d) return false;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getTime() < Date.now();
}

function upper(v) {
  return String(v || "").trim().toUpperCase();
}

function toAmount(v) {
  return Number(v || 0);
}

function toNullableNumber(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeTripType(v) {
  if (v === undefined || v === null || v === "") return null;
  return upper(v);
}

function normalizeString(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s || null;
}

// =======================
// Compliance enforcement
// =======================
async function enforceDriverCompliance(tx, driver) {
  if (!driver) return { ok: false, status: 404, message: "Driver not found" };

  if (driver.is_active === false) {
    return { ok: false, status: 400, message: "Cannot assign inactive driver" };
  }

  const st = upper(driver.status);
  if (st === "DISABLED") return { ok: false, status: 400, message: "Driver is DISABLED" };
  if (st === "INACTIVE") return { ok: false, status: 400, message: "Driver is INACTIVE" };

  if (isExpiredDate(driver.license_expiry_date)) {
    try {
      await tx.drivers.update({
        where: { id: driver.id },
        data: {
          is_active: false,
          status: "DISABLED",
          disable_reason: "LICENSE_EXPIRED",
        },
      });
    } catch (_) {}

    return { ok: false, status: 400, message: "Driver license expired" };
  }

  return { ok: true };
}

async function enforceVehicleCompliance(tx, vehicle) {
  if (!vehicle) return { ok: false, status: 404, message: "Vehicle not found" };

  if (typeof vehicle.is_active === "boolean" && !vehicle.is_active) {
    return { ok: false, status: 400, message: "Cannot assign inactive vehicle" };
  }

  const st = upper(vehicle.status);

  if (st && st !== "AVAILABLE") {
    if (st === "DISABLED") return { ok: false, status: 400, message: "Vehicle is DISABLED" };
    return { ok: false, status: 400, message: `Vehicle not AVAILABLE (current=${vehicle.status})` };
  }

  if (isExpiredDate(vehicle.license_expiry_date)) {
    try {
      await tx.vehicles.update({
        where: { id: vehicle.id },
        data: {
          is_active: false,
          status: "DISABLED",
          disable_reason: "LICENSE_EXPIRED",
        },
      });
    } catch (_) {}

    return { ok: false, status: 400, message: "Vehicle license expired" };
  }

  return { ok: true };
}

async function runComplianceCheck(driver_id, vehicle_id) {
  const [driver, vehicle] = await Promise.all([
    prisma.drivers.findUnique({
      where: { id: driver_id },
      select: {
        id: true,
        is_active: true,
        status: true,
        disable_reason: true,
        license_expiry_date: true,
      },
    }),
    prisma.vehicles.findUnique({
      where: { id: vehicle_id },
      select: {
        id: true,
        is_active: true,
        status: true,
        disable_reason: true,
        license_expiry_date: true,
      },
    }),
  ]);

  return prisma.$transaction(async (tx) => {
    const d = await enforceDriverCompliance(tx, driver);
    if (!d.ok) return d;

    const v = await enforceVehicleCompliance(tx, vehicle);
    if (!v.ok) return v;

    return { ok: true };
  });
}

// =======================
// Shared validators
// =======================
async function validateTripReferences({
  client_id,
  contract_id,
  site_id,
}) {
  const client = await prisma.clients.findUnique({
    where: { id: client_id },
    select: { id: true, name: true, is_active: true },
  });

  if (!client) {
    const err = new Error("Client not found");
    err.statusCode = 404;
    throw err;
  }

  const [contract, site] = await Promise.all([
    contract_id
      ? prisma.client_contracts.findUnique({
          where: { id: contract_id },
          select: {
            id: true,
            client_id: true,
            contract_no: true,
            status: true,
            start_date: true,
            end_date: true,
            currency: true,
          },
        })
      : null,
    site_id
      ? prisma.sites.findUnique({
          where: { id: site_id },
          select: { id: true, client_id: true, name: true, is_active: true },
        })
      : null,
  ]);

  if (contract_id && !contract) {
    const err = new Error("Contract not found");
    err.statusCode = 404;
    throw err;
  }

  if (contract && contract.client_id !== client_id) {
    const err = new Error("contract_id does not belong to client_id");
    err.statusCode = 400;
    throw err;
  }

  if (contract) {
    const st = upper(contract.status);
    if (st !== "ACTIVE") {
      const err = new Error("Selected contract is not ACTIVE");
      err.statusCode = 400;
      throw err;
    }

    if (contract.end_date && new Date(contract.end_date).getTime() < Date.now()) {
      const err = new Error("Selected contract is expired");
      err.statusCode = 400;
      throw err;
    }
  }

  if (site_id && !site) {
    const err = new Error("Site not found");
    err.statusCode = 404;
    throw err;
  }

  if (site && site.client_id !== client_id) {
    const err = new Error("site_id does not belong to client_id");
    err.statusCode = 400;
    throw err;
  }

  return {
    client,
    contract: contract || null,
    site: site || null,
  };
}

// =======================
// GET /trips
// =======================
async function getTrips(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = getAuthRole(req);
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || "25", 10), 1), 100);
    const skip = (page - 1) * pageSize;

    const where = {};

    const statusList = parseStatusList(req.query.status);
    if (statusList && statusList.length === 1) where.status = statusList[0];
    if (statusList && statusList.length > 1) where.status = { in: statusList };

    if (String(req.query.range || "").toLowerCase() === "today") {
      const { start, end } = dayRangeLocal(new Date());
      where.created_at = { gte: start, lte: end };
    }

    if (String(req.query.financial_closed_at || "").toLowerCase() === "null") {
      where.financial_closed_at = null;
    }

    if (req.query.client_id) {
      if (!isUuid(String(req.query.client_id))) {
        return res.status(400).json({ message: "Invalid client_id" });
      }
      where.client_id = String(req.query.client_id);
    }

    if (req.query.contract_id) {
      if (!isUuid(String(req.query.contract_id))) {
        return res.status(400).json({ message: "Invalid contract_id" });
      }
      where.contract_id = String(req.query.contract_id);
    }

    if (canViewAllTrips(role)) {
      // no extra filter
    } else if (role === ROLES.FIELD_SUPERVISOR) {
      where.trip_assignments = { some: { field_supervisor_id: userId } };
    }

    const [trips, total] = await Promise.all([
      prisma.trips.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          trip_code: true,
          status: true,
          financial_status: true,
          created_at: true,
          updated_at: true,
          scheduled_at: true,
          trip_type: true,
          notes: true,
          client_id: true,
          contract_id: true,
          site_id: true,
          cargo_type: true,
          cargo_weight: true,
          agreed_revenue: true,
          revenue_currency: true,
          revenue_entry_mode: true,
          origin: true,
          destination: true,
          actual_arrival_at: true,
          actual_departure_at: true,
          financial_closed_at: true,
          financial_review_opened_at: true,
          clients: {
            select: { id: true, name: true },
          },
          client_contracts: {
            select: { id: true, contract_no: true, status: true, currency: true },
          },
          site: {
            select: { id: true, name: true, address: true, is_active: true },
          },
        },
      }),
      prisma.trips.count({ where }),
    ]);

    const tripIds = trips.map((t) => t.id);
    if (tripIds.length === 0) {
      return res.json({ page, pageSize, total, items: [] });
    }

    const [activeAssignments, currentRevenues, approvedExpenses] = await Promise.all([
      prisma.trip_assignments.findMany({
        where: {
          trip_id: { in: tripIds },
          is_active: true,
        },
        orderBy: { assigned_at: "desc" },
        select: {
          id: true,
          trip_id: true,
          assigned_at: true,
          is_active: true,
          vehicle_id: true,
          driver_id: true,
          field_supervisor_id: true,
         vehicles: {
  select: {
    id: true,
    fleet_no: true,
    plate_no: true,
    display_name: true,
    status: true,
    is_active: true,
    license_expiry_date: true,
    disable_reason: true,
    supervisor_id: true,
    license_no: true,
    license_issue_date: true,
  },
},
          drivers: {
            select: {
              id: true,
              full_name: true,
              phone: true,
              status: true,
              license_expiry_date: true,
              disable_reason: true,
            },
          },
          users_trip_assignments_supervisor: {
            select: { id: true, full_name: true },
          },
        },
      }),

      prisma.trip_revenues.findMany({
        where: {
          trip_id: { in: tripIds },
          is_current: true,
        },
        orderBy: [{ is_approved: "desc" }, { version_no: "desc" }],
        select: {
          id: true,
          trip_id: true,
          amount: true,
          currency: true,
          source: true,
          entered_at: true,
          is_current: true,
          version_no: true,
          is_approved: true,
          pricing_rule_id: true,
          contract_id: true,
        },
      }),

      prisma.cash_expenses.findMany({
        where: {
          trip_id: { in: tripIds },
          approval_status: "APPROVED",
        },
        select: {
          id: true,
          trip_id: true,
          amount: true,
          payment_source: true,
          expense_type: true,
        },
      }),
    ]);

    const assignmentByTripId = new Map();
    for (const a of activeAssignments) {
      if (!assignmentByTripId.has(a.trip_id)) {
        assignmentByTripId.set(a.trip_id, a);
      }
    }

    const revenueByTripId = new Map();
    for (const row of currentRevenues) {
      if (!revenueByTripId.has(row.trip_id)) {
        revenueByTripId.set(row.trip_id, row);
      }
    }

    const expensesAggByTripId = new Map();
    for (const row of approvedExpenses) {
      const tripId = row.trip_id;
      const cur = expensesAggByTripId.get(tripId) || {
        expenses: 0,
        company_expenses: 0,
        advance_expenses: 0,
      };

      const amt = toAmount(row.amount);
      cur.expenses += amt;

      if (upper(row.payment_source) === "COMPANY") {
        cur.company_expenses += amt;
      } else {
        cur.advance_expenses += amt;
      }

      expensesAggByTripId.set(tripId, cur);
    }

    const items = trips.map((t) => {
      const revenueRow = revenueByTripId.get(t.id);
      const expensesAgg = expensesAggByTripId.get(t.id) || {
        expenses: 0,
        company_expenses: 0,
        advance_expenses: 0,
      };

      const revenue = revenueRow ? toAmount(revenueRow.amount) : toAmount(t.agreed_revenue);
      const expenses = toAmount(expensesAgg.expenses);
      const profit = revenue - expenses;

      let profit_status = "BREAK_EVEN";
      if (profit > 0) profit_status = "PROFIT";
      if (profit < 0) profit_status = "LOSS";

      return {
        ...t,
        revenue,
        expenses,
        company_expenses: toAmount(expensesAgg.company_expenses),
        advance_expenses: toAmount(expensesAgg.advance_expenses),
        profit,
        profit_status,
        currency: revenueRow?.currency || t.revenue_currency || "EGP",
        current_revenue: revenueRow || null,
        trip_assignments: assignmentByTripId.get(t.id)
          ? [assignmentByTripId.get(t.id)]
          : [],
      };
    });

    return res.json({ page, pageSize, total, items });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch trips",
      error: e.message,
    });
  }
}

// =======================
// GET /trips/:id
// =======================
async function getTripById(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = getAuthRole(req);
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid trip id" });

    const trip = await prisma.trips.findUnique({
      where: { id },
      include: {
        clients: true,
        client_contracts: true,
        site: true,
        trip_assignments: {
          orderBy: { assigned_at: "desc" },
          include: {
            vehicles: true,
            drivers: true,
            users_trip_assignments_supervisor: true,
          },
        },
        trip_events: {
          orderBy: { created_at: "desc" },
          take: 50,
        },
        trip_revenues: {
          orderBy: [{ is_current: "desc" }, { version_no: "desc" }],
          take: 10,
          include: {
            users_entered: {
              select: { id: true, full_name: true, email: true, role: true },
            },
            users_approved: {
              select: { id: true, full_name: true, email: true, role: true },
            },
            users_replaced: {
              select: { id: true, full_name: true, email: true, role: true },
            },
            contract_pricing_rules: {
              select: {
                id: true,
                priority: true,
                base_price: true,
                currency: true,
              },
            },
            client_contracts: {
              select: {
                id: true,
                contract_no: true,
                status: true,
                currency: true,
              },
            },
          },
        },
        cash_expenses: {
          orderBy: { created_at: "desc" },
        },
        invoice_trip_lines: {
          include: {
            ar_invoices: true,
          },
        },
      },
    });

    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (role === ROLES.FIELD_SUPERVISOR) {
      const ok = (trip.trip_assignments || []).some(
        (a) => a.field_supervisor_id === userId
      );
      if (!ok) return res.status(403).json({ message: "Forbidden" });
    }

    return res.json(trip);
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch trip",
      error: e.message,
    });
  }
}

// =======================
// GET /trips/:id/finance/summary
// =======================
async function getTripFinanceSummary(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = getAuthRole(req);
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid trip id" });

    if (role === ROLES.FIELD_SUPERVISOR) {
      const assignment = await prisma.trip_assignments.findFirst({
        where: {
          trip_id: id,
          field_supervisor_id: userId,
        },
        select: { id: true },
      });

      if (!assignment) {
        return res.status(403).json({ message: "Forbidden" });
      }
    }

    const data = await tripFinanceService.getTripFinanceSummary(id);

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

// =======================
// POST /trips/:id/auto-price
// =======================
async function autoPriceTrip(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = getAuthRole(req);
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid trip id" });

    const { contract_id, notes, auto_approve } = req.body || {};

    const result = await tripRevenuesService.autoCalculateTripRevenue({
      trip_id: id,
      contract_id: contract_id || null,
      entered_by: userId,
      notes: notes || "AUTO_CALCULATED_MANUALLY",
      autoApprove: !!auto_approve,
    });

    return res.json({
      success: true,
      message: "Trip revenue calculated successfully",
      data: result,
    });
  } catch (e) {
    return res.status(e.statusCode || 500).json({
      success: false,
      message: e?.message || "Failed to auto-calculate trip revenue",
    });
  }
}

// =======================
// POST /trips
// =======================
async function createTrip(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = getAuthRole(req);
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const {
      client_id,
      contract_id,
      site_id,
      scheduled_at,
      trip_type,
      cargo_type,
      cargo_weight,
      origin,
      destination,
      notes,
      agreed_revenue,
      revenue_currency,
      revenue_entry_mode,
    } = req.body || {};

    if (!isUuid(client_id)) {
      return res.status(400).json({ message: "Invalid client_id" });
    }

    if (contract_id && !isUuid(contract_id)) {
      return res.status(400).json({ message: "Invalid contract_id" });
    }

    if (site_id && !isUuid(site_id)) {
      return res.status(400).json({ message: "Invalid site_id" });
    }

    const normalizedTripType = normalizeTripType(trip_type);
    const normalizedCargoType = normalizeString(cargo_type);
    const normalizedOrigin = normalizeString(origin);
    const normalizedDestination = normalizeString(destination);
    const normalizedNotes = normalizeString(notes);
    const normalizedRevenueCurrency = normalizeString(revenue_currency);
    const normalizedRevenueEntryMode = normalizeString(revenue_entry_mode);

    const normalizedCargoWeight = toNullableNumber(cargo_weight);
    if (cargo_weight !== undefined && normalizedCargoWeight === null) {
      return res.status(400).json({ message: "Invalid cargo_weight" });
    }
    if (normalizedCargoWeight !== null && normalizedCargoWeight < 0) {
      return res.status(400).json({ message: "cargo_weight must be >= 0" });
    }

    const normalizedAgreedRevenue = toNullableNumber(agreed_revenue);
    if (agreed_revenue !== undefined && normalizedAgreedRevenue === null) {
      return res.status(400).json({ message: "Invalid agreed_revenue" });
    }
    if (normalizedAgreedRevenue !== null && normalizedAgreedRevenue < 0) {
      return res.status(400).json({ message: "agreed_revenue must be >= 0" });
    }

    let scheduledAtValue = null;
    if (scheduled_at !== undefined && scheduled_at !== null && String(scheduled_at).trim() !== "") {
      scheduledAtValue = new Date(scheduled_at);
      if (Number.isNaN(scheduledAtValue.getTime())) {
        return res.status(400).json({ message: "Invalid scheduled_at" });
      }
    }

    const refs = await validateTripReferences({
      client_id,
      contract_id: contract_id || null,
      site_id: site_id || null,
    });

    const created = await prisma.trips.create({
      data: {
        client_id,
        contract_id: refs.contract?.id || null,
        site_id: refs.site?.id || null,
        created_by: userId,
        scheduled_at: scheduledAtValue,
        trip_type: normalizedTripType,
        cargo_type: normalizedCargoType,
        cargo_weight: normalizedCargoWeight,
        origin: normalizedOrigin,
        destination: normalizedDestination,
        notes: normalizedNotes,
        agreed_revenue: normalizedAgreedRevenue,
        revenue_currency: normalizedRevenueCurrency,
        revenue_entry_mode: normalizedRevenueEntryMode,
        status: "DRAFT",
        financial_status: "OPEN",
      },
      include: {
        clients: true,
        client_contracts: true,
        site: true,
      },
    });

    return res.status(201).json(created);
  } catch (e) {
    return res.status(e.statusCode || 500).json({
      message: e?.message || "Failed to create trip",
      error: e.message,
    });
  }
}

// =======================
// POST /trips/:id/assign
// =======================
async function assignTrip(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = getAuthRole(req);
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid trip id" });

    const { vehicle_id, driver_id, field_supervisor_id } = req.body || {};
    if (!isUuid(vehicle_id)) return res.status(400).json({ message: "Invalid vehicle_id" });
    if (!isUuid(driver_id)) return res.status(400).json({ message: "Invalid driver_id" });
    if (field_supervisor_id && !isUuid(field_supervisor_id)) {
      return res.status(400).json({ message: "Invalid field_supervisor_id" });
    }

    const trip = await prisma.trips.findUnique({ where: { id } });
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (trip.status !== "DRAFT") {
      return res.status(400).json({
        message: `Trip must be DRAFT to assign (current=${trip.status})`,
      });
    }

    const compliance = await runComplianceCheck(driver_id, vehicle_id);
    if (!compliance.ok) {
      return res.status(compliance.status || 400).json({
        message: compliance.message,
      });
    }

    const [busyDriver, busyVehicle] = await Promise.all([
      prisma.trip_assignments.findFirst({
        where: { driver_id, is_active: true, trip_id: { not: id } },
        select: { id: true, trip_id: true },
      }),
      prisma.trip_assignments.findFirst({
        where: { vehicle_id, is_active: true, trip_id: { not: id } },
        select: { id: true, trip_id: true },
      }),
    ]);

    if (busyDriver) {
      return res.status(400).json({
        message: "Driver is already assigned to another active trip",
      });
    }

    if (busyVehicle) {
      return res.status(400).json({
        message: "Vehicle is already assigned to another active trip",
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.trip_assignments.updateMany({
        where: { trip_id: id, is_active: true },
        data: { is_active: false, unassigned_at: new Date() },
      });

      const a = await tx.trip_assignments.create({
        data: {
          trip_id: id,
          vehicle_id,
          driver_id,
          field_supervisor_id: field_supervisor_id || null,
          is_active: true,
        },
      });

      const t = await tx.trips.update({
        where: { id },
        data: { status: "ASSIGNED" },
      });

      await tx.trip_events.create({
        data: {
          trip_id: id,
          event_type: "ASSIGN",
          created_by_user: userId,
          payload: {
            vehicle_id,
            driver_id,
            field_supervisor_id: field_supervisor_id || null,
          },
        },
      });

      return { trip: t, assignment: a };
    });

    return res.json({ message: "Assigned", ...updated });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to assign trip",
      error: e.message,
    });
  }
}

// =======================
// POST /trips/:id/start
// =======================
async function startTrip(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = getAuthRole(req);
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid trip id" });

    const trip = await prisma.trips.findUnique({
      where: { id },
      include: {
        trip_assignments: {
          where: { is_active: true },
          take: 1,
          select: { driver_id: true, vehicle_id: true },
        },
      },
    });

    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (trip.status !== "ASSIGNED") {
      return res.status(400).json({
        message: `Trip must be ASSIGNED to start (current=${trip.status})`,
      });
    }

    const activeAssignment = (trip.trip_assignments || [])[0];
    if (!activeAssignment) {
      return res.status(400).json({ message: "Trip has no active assignment" });
    }

    const compliance = await runComplianceCheck(
      activeAssignment.driver_id,
      activeAssignment.vehicle_id
    );

    if (!compliance.ok) {
      return res.status(compliance.status || 400).json({
        message: `Cannot start trip: ${compliance.message}`,
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.trips.update({
        where: { id },
        data: {
          status: "IN_PROGRESS",
          actual_departure_at: trip.actual_departure_at || new Date(),
        },
      });

      await tx.vehicles.update({
        where: { id: activeAssignment.vehicle_id },
        data: {
          status: "ON_TRIP",
        },
      });

      await tx.trip_events.create({
        data: {
          trip_id: id,
          event_type: "START",
          created_by_user: userId,
          payload: {},
        },
      });

      return t;
    });

    return res.json({ message: "Started", trip: updated });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to start trip",
      error: e.message,
    });
  }
}

// =======================
// POST /trips/:id/finish
// =======================
async function finishTrip(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = getAuthRole(req);
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid trip id" });

    const trip = await prisma.trips.findUnique({
      where: { id },
      include: {
        trip_assignments: {
          where: { is_active: true },
          take: 1,
          select: {
            id: true,
            vehicle_id: true,
            driver_id: true,
          },
        },
      },
    });

    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (trip.status !== "IN_PROGRESS") {
      return res.status(400).json({
        message: `Trip must be IN_PROGRESS to finish (current=${trip.status})`,
      });
    }

    const activeAssignment = trip.trip_assignments?.[0] || null;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.trip_assignments.updateMany({
        where: { trip_id: id, is_active: true },
        data: { is_active: false, unassigned_at: new Date() },
      });

      const t = await tx.trips.update({
        where: { id },
        data: {
          status: "COMPLETED",
          actual_arrival_at: trip.actual_arrival_at || new Date(),
        },
      });

      if (activeAssignment?.vehicle_id) {
        await tx.vehicles.updateMany({
          where: {
            id: activeAssignment.vehicle_id,
            status: "ON_TRIP",
          },
          data: {
            status: "AVAILABLE",
          },
        });
      }

      await tx.trip_events.create({
        data: {
          trip_id: id,
          event_type: "FINISH",
          created_by_user: userId,
          payload: {},
        },
      });

      return t;
    });

    let autoPricing = null;
    let autoPricingWarning = null;

    try {
      autoPricing = await tripRevenuesService.autoCalculateTripRevenue({
        trip_id: id,
        entered_by: userId,
        notes: "AUTO_CALCULATED_ON_FINISH",
        autoApprove: false,
      });
    } catch (autoErr) {
      autoPricingWarning = autoErr?.message || "Auto pricing skipped";
    }

    return res.json({
      message: "Finished",
      trip: updated,
      auto_pricing: autoPricing,
      auto_pricing_warning: autoPricingWarning,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to finish trip",
      error: e.message,
    });
  }
}

module.exports = {
  getTrips,
  getTripById,
  getTripFinanceSummary,
  autoPriceTrip,
  createTrip,
  assignTrip,
  startTrip,
  finishTrip,
};