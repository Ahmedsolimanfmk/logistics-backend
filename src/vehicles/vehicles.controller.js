// =======================
// src/vehicles/vehicles.controller.js
// tenant-safe version
// schema-aligned without is_active
// =======================

const prisma = require("../prisma");

// =====================
// FLEET DASHBOARD
// =====================
exports.getFleetDashboard = async (req, res, next) => {
  try {
    const companyId = req.companyId;

    // 1. Vehicle Stats
    const vehicleStats = await prisma.vehicles.groupBy({
      by: ["status"],
      where: { company_id: companyId },
      _count: { id: true },
    });

    const vData = { total: 0, ACTIVE: 0, IN_MAINTENANCE: 0, IDLE: 0 };
    vehicleStats.forEach(v => {
      vData[v.status] = v._count.id;
      vData.total += v._count.id;
    });

    // 2. Driver Stats
    const driverStats = await prisma.drivers.groupBy({
      by: ["status"],
      where: { company_id: companyId },
      _count: { id: true },
    });
    
    const dData = { total: 0, active: 0, inactive: 0 };
    driverStats.forEach(d => {
      if (d.status === "ACTIVE") dData.active += d._count.id;
      else dData.inactive += d._count.id;
      dData.total += d._count.id;
    });

    // 3. Maintenance Stats
    const maintenanceStats = await prisma.maintenance_requests.groupBy({
      by: ["status"],
      where: { company_id: companyId },
      _count: { id: true }
    });

    const mData = { total: 0, PENDING: 0, APPROVED: 0, COMPLETED: 0, REJECTED: 0 };
    maintenanceStats.forEach(m => {
      mData[m.status] = m._count.id;
      mData.total += m._count.id;
    });

    // 4. Expiring Licenses (Vehicles) - Next 30 days
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const expiringVehicles = await prisma.vehicles.findMany({
      where: {
        company_id: companyId,
        license_expiry_date: { lte: nextMonth, gte: new Date() }
      },
      select: { id: true, plate_no: true, license_expiry_date: true },
      take: 10,
      orderBy: { license_expiry_date: "asc" }
    });

    // 5. Expiring Licenses (Drivers)
    const expiringDrivers = await prisma.drivers.findMany({
      where: {
        company_id: companyId,
        license_expiry_date: { lte: nextMonth, gte: new Date() }
      },
      select: { id: true, full_name: true, license_expiry_date: true },
      take: 10,
      orderBy: { license_expiry_date: "asc" }
    });

    res.json({
      vehicles: vData,
      drivers: dData,
      maintenance: mData,
      expiring: {
        vehicles: expiringVehicles,
        drivers: expiringDrivers
      }
    });

  } catch (error) {
    next(error);
  }
};

// =====================
// LIST VEHICLES
// =======================

function normalizeText(input) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function parseIntQuery(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseDateOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function isExpiredDate(dateValue) {
  if (!dateValue) return false;

  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return false;

  return d.getTime() < Date.now();
}

function buildVehicleLabel(vehicle) {
  const fleetNo = vehicle?.fleet_no ? String(vehicle.fleet_no).trim() : "";
  const plateNo = vehicle?.plate_no ? String(vehicle.plate_no).trim() : "";
  const displayName = vehicle?.display_name
    ? String(vehicle.display_name).trim()
    : "";

  if (fleetNo && plateNo) return `${fleetNo} - ${plateNo}`;
  return fleetNo || plateNo || displayName || vehicle?.id;
}

function asVehicleOption(vehicle) {
  return {
    ...vehicle,
    value: vehicle.id,
    label: buildVehicleLabel(vehicle),
  };
}

function buildVehicleWhere(companyId, query) {
  const { q, status } = query || {};

  const where = {
    company_id: companyId,
  };

  if (status) {
    where.status = upper(status);
  }

  if (q) {
    const search = String(q).trim();

    where.OR = [
      { fleet_no: { contains: search, mode: "insensitive" } },
      { plate_no: { contains: search, mode: "insensitive" } },
      { display_name: { contains: search, mode: "insensitive" } },
      { license_no: { contains: search, mode: "insensitive" } },
      { model: { contains: search, mode: "insensitive" } },
    ];
  }

  return where;
}

async function getVehicleOrThrow(companyId, id, select) {
  const vehicle = await prisma.vehicles.findFirst({
    where: {
      id,
      company_id: companyId,
    },
    ...(select ? { select } : {}),
  });

  if (!vehicle) {
    const err = new Error("Vehicle not found");
    err.statusCode = 404;
    throw err;
  }

  return vehicle;
}

function handleKnownError(res, error, fallbackMessage) {
  const status = error?.statusCode || 500;

  if (error?.code === "P2002") {
    return res.status(409).json({
      message: "fleet_no or plate_no already exists in this company",
    });
  }

  return res.status(status).json({
    message: status >= 500 ? fallbackMessage : error?.message || fallbackMessage,
    ...(status >= 500
      ? {
          error: error?.message || String(error),
          code: error?.code,
          meta: error?.meta,
        }
      : {}),
  });
}

// =======================
// GET /vehicles/active
// =======================
async function getActiveVehicles(req, res) {
  try {
    const q = String(req.query.q || "").trim();

    const where = {
      company_id: req.companyId,
      status: "AVAILABLE",
      ...(q
        ? {
            OR: [
              { fleet_no: { contains: q, mode: "insensitive" } },
              { plate_no: { contains: q, mode: "insensitive" } },
              { display_name: { contains: q, mode: "insensitive" } },
              { license_no: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const list = await prisma.vehicles.findMany({
      where,
      orderBy: [{ fleet_no: "asc" }, { plate_no: "asc" }],
      select: {
        id: true,
        fleet_no: true,
        plate_no: true,
        display_name: true,
        status: true,
        license_expiry_date: true,
        disable_reason: true,
      },
    });

    const items = list
      .filter((vehicle) => !isExpiredDate(vehicle.license_expiry_date))
      .map(asVehicleOption);

    return res.json(items);
  } catch (error) {
    return handleKnownError(res, error, "Failed to fetch active vehicles");
  }
}

// =======================
// GET /vehicles
// =======================
async function getVehicles(req, res) {
  try {
    const query = req.query || {};
    const where = buildVehicleWhere(req.companyId, query);

    const limitInput = query.limit ?? query.pageSize;
    const pageNum = Math.max(1, parseIntQuery(query.page, 1));
    const limitNum = Math.min(100, Math.max(1, parseIntQuery(limitInput, 20)));
    const skip = (pageNum - 1) * limitNum;

    const [itemsRaw, total] = await Promise.all([
      prisma.vehicles.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { fleet_no: "asc" }],
        skip,
        take: limitNum,
        select: {
          id: true,
          company_id: true,
          fleet_no: true,
          plate_no: true,
          display_name: true,
          status: true,
          current_odometer: true,
          gps_device_id: true,
          model: true,
          year: true,
          license_no: true,
          license_issue_date: true,
          license_expiry_date: true,
          disable_reason: true,
          created_at: true,
          updated_at: true,
        },
      }),
      prisma.vehicles.count({ where }),
    ]);

    const items = itemsRaw.map(asVehicleOption);

    return res.json({
      items,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    return handleKnownError(res, error, "Failed to fetch vehicles");
  }
}

// =======================
// GET /vehicles/:id
// =======================
async function getVehicleById(req, res) {
  try {
    const { id } = req.params;
    const vehicle = await getVehicleOrThrow(req.companyId, id);
    return res.json(asVehicleOption(vehicle));
  } catch (error) {
    return handleKnownError(res, error, "Failed to fetch vehicle");
  }
}

// =======================
// POST /vehicles
// =======================
async function createVehicle(req, res) {
  try {
    const {
      fleet_no,
      plate_no,
      status,
      display_name,
      model,
      year,
      current_odometer,
      gps_device_id,
      license_no,
      license_issue_date,
      license_expiry_date,
      disable_reason,
    } = req.body || {};

    if (!fleet_no) {
      return res.status(400).json({ message: "fleet_no is required" });
    }

    if (!plate_no) {
      return res.status(400).json({ message: "plate_no is required" });
    }

    const fleetNormalized = normalizeText(fleet_no);
    const plateNormalized = normalizeText(plate_no);

    let odometerValue = null;
    if (current_odometer !== undefined && current_odometer !== null) {
      const n = Number(current_odometer);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return res.status(400).json({
          message: "current_odometer must be a non-negative integer",
        });
      }
      odometerValue = n;
    }

    let yearValue = null;
    if (year !== undefined && year !== null) {
      const n = Number(year);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return res.status(400).json({
          message: "year must be an integer",
        });
      }
      yearValue = n;
    }

    const licIssue = parseDateOrNull(license_issue_date);
    if (license_issue_date !== undefined && licIssue === undefined) {
      return res.status(400).json({ message: "Invalid license_issue_date" });
    }

    const licExpiry = parseDateOrNull(license_expiry_date);
    if (license_expiry_date !== undefined && licExpiry === undefined) {
      return res.status(400).json({ message: "Invalid license_expiry_date" });
    }

    const now = new Date();

    const vehicle = await prisma.vehicles.create({
      data: {
        company_id: req.companyId,
        fleet_no: fleetNormalized,
        plate_no: plateNormalized,
        status: status ? upper(status) : "AVAILABLE",
        display_name: display_name ? String(display_name).trim() : null,
        model: model ? String(model).trim() : null,
        year: yearValue,
        current_odometer: odometerValue,
        gps_device_id: gps_device_id ? String(gps_device_id).trim() : null,
        license_no: license_no ? String(license_no).trim() : null,
        license_issue_date: licIssue === undefined ? null : licIssue,
        license_expiry_date: licExpiry === undefined ? null : licExpiry,
        disable_reason: disable_reason ? upper(disable_reason) : null,
        created_at: now,
        updated_at: now,
      },
    });

    return res.status(201).json(asVehicleOption(vehicle));
  } catch (error) {
    return handleKnownError(res, error, "Failed to create vehicle");
  }
}

// =======================
// PATCH /vehicles/:id
// =======================
async function updateVehicle(req, res) {
  try {
    const { id } = req.params;

    await getVehicleOrThrow(req.companyId, id);

    const body = req.body || {};

    const {
      fleet_no,
      plate_no,
      status,
      display_name,
      model,
      year,
      current_odometer,
      gps_device_id,
      license_no,
      license_issue_date,
      license_expiry_date,
      disable_reason,
    } = body;

    const data = {};

    if (fleet_no !== undefined) {
      if (!fleet_no) {
        return res.status(400).json({ message: "fleet_no cannot be empty" });
      }
      data.fleet_no = normalizeText(fleet_no);
    }

    if (plate_no !== undefined) {
      if (!plate_no) {
        return res.status(400).json({ message: "plate_no cannot be empty" });
      }
      data.plate_no = normalizeText(plate_no);
    }

    if (status !== undefined) {
      data.status = status ? upper(status) : null;
    }

    if (display_name !== undefined) {
      data.display_name = display_name ? String(display_name).trim() : null;
    }

    if (model !== undefined) {
      data.model = model ? String(model).trim() : null;
    }

    if (year !== undefined) {
      if (year === null) {
        data.year = null;
      } else {
        const n = Number(year);
        if (!Number.isFinite(n) || !Number.isInteger(n)) {
          return res.status(400).json({ message: "year must be an integer" });
        }
        data.year = n;
      }
    }

    if (current_odometer !== undefined) {
      if (current_odometer === null) {
        data.current_odometer = null;
      } else {
        const n = Number(current_odometer);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
          return res.status(400).json({
            message: "current_odometer must be a non-negative integer",
          });
        }
        data.current_odometer = n;
      }
    }

    if (gps_device_id !== undefined) {
      data.gps_device_id = gps_device_id ? String(gps_device_id).trim() : null;
    }

    if (license_no !== undefined) {
      data.license_no = license_no ? String(license_no).trim() : null;
    }

    if (license_issue_date !== undefined) {
      const d = parseDateOrNull(license_issue_date);
      if (d === undefined) {
        return res.status(400).json({ message: "Invalid license_issue_date" });
      }
      data.license_issue_date = d;
    }

    if (license_expiry_date !== undefined) {
      const d = parseDateOrNull(license_expiry_date);
      if (d === undefined) {
        return res.status(400).json({ message: "Invalid license_expiry_date" });
      }
      data.license_expiry_date = d;
    }

    if (disable_reason !== undefined) {
      data.disable_reason = disable_reason ? upper(disable_reason) : null;
    }

    data.updated_at = new Date();

    const updated = await prisma.vehicles.update({
      where: { id },
      data,
    });

    return res.json(asVehicleOption(updated));
  } catch (error) {
    return handleKnownError(res, error, "Failed to update vehicle");
  }
}

// =======================
// PATCH /vehicles/:id/toggle
// Replacement: toggle disable/available without is_active
// =======================
async function toggleVehicle(req, res) {
  try {
    const { id } = req.params;
    const existing = await getVehicleOrThrow(req.companyId, id);

    const currentlyDisabled = String(existing.status || "").toUpperCase() === "DISABLED";

    const updated = await prisma.vehicles.update({
      where: { id },
      data: {
        status: currentlyDisabled ? "AVAILABLE" : "DISABLED",
        disable_reason: currentlyDisabled ? null : existing.disable_reason || "OTHER",
        updated_at: new Date(),
      },
    });

    return res.json(asVehicleOption(updated));
  } catch (error) {
    return handleKnownError(res, error, "Failed to toggle vehicle");
  }
}

// =======================
// DELETE /vehicles/:id
// soft delete replacement = DISABLED
// =======================
async function deleteVehicle(req, res) {
  try {
    const { id } = req.params;

    await getVehicleOrThrow(req.companyId, id);

    const updated = await prisma.vehicles.update({
      where: { id },
      data: {
        status: "DISABLED",
        disable_reason: "OTHER",
        updated_at: new Date(),
      },
    });

    return res.json({
      ok: true,
      vehicle: asVehicleOption(updated),
    });
  } catch (error) {
    return handleKnownError(res, error, "Failed to delete/deactivate vehicle");
  }
}

// =======================
// GET /vehicles/:id/summary
// =======================
async function getVehicleSummary(req, res) {
  try {
    const { id } = req.params;

    const vehicle = await getVehicleOrThrow(req.companyId, id, {
      id: true,
      company_id: true,
      fleet_no: true,
      plate_no: true,
      display_name: true,
      license_no: true,
      license_issue_date: true,
      license_expiry_date: true,
      status: true,
      disable_reason: true,
      current_odometer: true,
      created_at: true,
      updated_at: true,
    });

    const assignments = await prisma.trip_assignments.findMany({
      where: {
        company_id: req.companyId,
        vehicle_id: id,
      },
      orderBy: { assigned_at: "desc" },
      take: 100,
      select: {
        id: true,
        trip_id: true,
        assigned_at: true,
        is_active: true,
        trips: {
          select: {
            id: true,
            company_id: true,
            status: true,
            scheduled_at: true,
            financial_status: true,
            clients: {
              select: {
                name: true,
              },
            },
            sites: {
              select: {
                name: true,
              },
            },
          },
        },
        drivers: {
          select: {
            id: true,
            full_name: true,
            phone: true,
          },
        },
      },
    });

    const validAssignments = assignments.filter(
      (item) => !item.trips || item.trips.company_id === req.companyId
    );

    const uniqueTripIds = [
      ...new Set(validAssignments.map((item) => item.trip_id).filter(Boolean)),
    ];

    let expenses = [];
    if (uniqueTripIds.length > 0) {
      expenses = await prisma.cash_expenses.findMany({
        where: {
          company_id: req.companyId,
          vehicle_id: id,
          trip_id: {
            in: uniqueTripIds,
          },
        },
        orderBy: { created_at: "desc" },
        take: 200,
      });
    }

    const completedTrips = validAssignments.filter(
      (item) => item?.trips?.status === "COMPLETED"
    ).length;

    const activeTrips = validAssignments.filter(
      (item) => item.is_active === true
    ).length;

    const totalExpenses = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0
    );

    const approvedExpenses = expenses
      .filter((expense) => expense.approval_status === "APPROVED")
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    return res.json({
      vehicle: asVehicleOption(vehicle),
      summary: {
        total_trips: uniqueTripIds.length,
        completed_trips: completedTrips,
        active_trips: activeTrips,
        expenses_count: expenses.length,
        total_expenses: totalExpenses,
        approved_expenses: approvedExpenses,
      },
      recent_trips: validAssignments.slice(0, 20),
      recent_expenses: expenses.slice(0, 20),
    });
  } catch (error) {
    return handleKnownError(res, error, "Failed to fetch vehicle summary");
  }
}

// =====================
// GET FLEET EXPENSES
// =====================
exports.getFleetExpenses = async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { vehicle_id, start_date, end_date } = req.query;

    const where = { company_id: companyId, vehicle_id: { not: null } };
    if (vehicle_id) where.vehicle_id = vehicle_id;
    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) where.created_at.gte = new Date(start_date);
      if (end_date) where.created_at.lte = new Date(end_date);
    }

    const rawExpenses = await prisma.cash_expenses.groupBy({
      by: ["vehicle_id", "expense_type"],
      where,
      _sum: { amount: true },
    });

    const vehicleIds = [...new Set(rawExpenses.map(e => e.vehicle_id))];
    const vehicles = await prisma.vehicles.findMany({
      where: { id: { in: vehicleIds }, company_id: companyId },
      select: { id: true, fleet_no: true, plate_no: true, display_name: true }
    });
    
    const vehiclesMap = {};
    vehicles.forEach(v => { vehiclesMap[v.id] = v; });

    const reportByVehicle = {};
    let grandTotal = 0;

    rawExpenses.forEach(exp => {
      const vid = exp.vehicle_id;
      if (!reportByVehicle[vid]) {
        reportByVehicle[vid] = { vehicle: vehiclesMap[vid], total: 0, breakdown: {} };
      }
      const amount = Number(exp._sum.amount) || 0;
      reportByVehicle[vid].breakdown[exp.expense_type] = amount;
      reportByVehicle[vid].total += amount;
      grandTotal += amount;
    });

    const reportArray = Object.values(reportByVehicle).sort((a, b) => b.total - a.total);

    return res.json({ items: reportArray, grandTotal, filters: { start_date, end_date, vehicle_id } });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  getActiveVehicles,
  getVehicles,
  getVehicleById,
  getVehicleSummary,
  createVehicle,
  updateVehicle,
  toggleVehicle,
  deleteVehicle,
  getFleetDashboard: exports.getFleetDashboard,
  getFleetExpenses: exports.getFleetExpenses
};