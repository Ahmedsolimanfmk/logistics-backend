// =======================
// src/vehicles/vehicles.controller.js
// tenant-safe version
// =======================

const prisma = require("../prisma");

// =======================
// Helpers
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

function parseBooleanQuery(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
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

function getAuthRole(req) {
  return String(req.user?.role || "").trim().toUpperCase();
}

function getAuthUserId(req) {
  return req.user?.sub || req.user?.id || null;
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
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
  const displayName = vehicle?.display_name ? String(vehicle.display_name).trim() : "";

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

function buildVehicleWhere(companyId, query, req) {
  const { q, status, is_active, unassigned, supervisor_id } = query || {};

  const where = {
    company_id: companyId,
  };

  const role = getAuthRole(req);
  const userId = getAuthUserId(req);

  if (String(unassigned || "").toLowerCase() === "true") {
    if (role !== "ADMIN" && role !== "HR") {
      const err = new Error("Forbidden");
      err.statusCode = 403;
      throw err;
    }
    where.supervisor_id = null;
  }

  if (role === "FIELD_SUPERVISOR") {
    where.supervisor_id = userId;
  } else if (supervisor_id) {
    where.supervisor_id = String(supervisor_id).trim();
  }

  if (status) {
    where.status = upper(status);
  }

  const isActiveParsed = parseBooleanQuery(is_active);
  if (typeof isActiveParsed === "boolean") {
    where.is_active = isActiveParsed;
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

async function ensureSupervisorBelongsToCompany(companyId, supervisorId) {
  if (supervisorId === null) return null;

  const sid = String(supervisorId || "").trim();
  if (!isUuid(sid)) {
    const err = new Error("Invalid supervisor_id");
    err.statusCode = 400;
    throw err;
  }

  const membership = await prisma.company_users.findFirst({
    where: {
      company_id: companyId,
      user_id: sid,
      is_active: true,
      status: "ACTIVE",
    },
    select: {
      user_id: true,
    },
  });

  if (!membership) {
    const err = new Error("Supervisor does not belong to this company");
    err.statusCode = 400;
    throw err;
  }

  return sid;
}

function handleKnownError(res, error, fallbackMessage) {
  const status = error?.statusCode || 500;

  if (error?.code === "P2002") {
    return res.status(409).json({
      message: "fleet_no or plate_no already exists in this company",
    });
  }

  return res.status(status).json({
    message: error?.message || fallbackMessage,
    ...(status >= 500 ? { error: error?.message } : {}),
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
      is_active: true,
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
        is_active: true,
        license_expiry_date: true,
        disable_reason: true,
        supervisor_id: true,
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

/**
 * GET /vehicles
 * query:
 *  - q
 *  - status
 *  - is_active=true|false
 *  - unassigned=true
 *  - supervisor_id
 *  - page
 *  - limit
 *  - pageSize
 */
async function getVehicles(req, res) {
  try {
    const query = req.query || {};
    const where = buildVehicleWhere(req.companyId, query, req);

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
          is_active: true,
          supervisor_id: true,
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

/**
 * GET /vehicles/:id
 */
async function getVehicleById(req, res) {
  try {
    const { id } = req.params;

    const vehicle = await getVehicleOrThrow(req.companyId, id);

    return res.json(asVehicleOption(vehicle));
  } catch (error) {
    return handleKnownError(res, error, "Failed to fetch vehicle");
  }
}

/**
 * POST /vehicles
 */
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
      is_active,
      supervisor_id,
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

    let supervisorIdValue = null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "supervisor_id")) {
      supervisorIdValue = await ensureSupervisorBelongsToCompany(
        req.companyId,
        supervisor_id
      );
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
        is_active: typeof is_active === "boolean" ? is_active : true,
        supervisor_id: supervisorIdValue,
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

/**
 * PATCH /vehicles/:id
 */
async function updateVehicle(req, res) {
  try {
    const { id } = req.params;

    await getVehicleOrThrow(req.companyId, id);

    const role = getAuthRole(req);
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
      is_active,
      supervisor_id,
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

    if (typeof is_active === "boolean") {
      data.is_active = is_active;
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

    if (Object.prototype.hasOwnProperty.call(body, "supervisor_id")) {
      if (role !== "ADMIN" && role !== "HR") {
        return res.status(403).json({
          message: "Forbidden (supervisor assignment is ADMIN/HR only)",
        });
      }

      data.supervisor_id = await ensureSupervisorBelongsToCompany(
        req.companyId,
        supervisor_id
      );
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

/**
 * PATCH /vehicles/:id/toggle
 */
async function toggleVehicle(req, res) {
  try {
    const { id } = req.params;

    const existing = await getVehicleOrThrow(req.companyId, id);

    const updated = await prisma.vehicles.update({
      where: { id },
      data: {
        is_active: !existing.is_active,
        updated_at: new Date(),
      },
    });

    return res.json(asVehicleOption(updated));
  } catch (error) {
    return handleKnownError(res, error, "Failed to toggle vehicle");
  }
}

/**
 * DELETE /vehicles/:id
 * soft delete = deactivate
 */
async function deleteVehicle(req, res) {
  try {
    const { id } = req.params;

    await getVehicleOrThrow(req.companyId, id);

    const updated = await prisma.vehicles.update({
      where: { id },
      data: {
        is_active: false,
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

/**
 * GET /vehicles/:id/summary
 */
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
      is_active: true,
      disable_reason: true,
      current_odometer: true,
      supervisor_id: true,
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

    const uniqueTripIds = [...new Set(validAssignments.map((item) => item.trip_id).filter(Boolean))];

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

module.exports = {
  getActiveVehicles,
  getVehicles,
  getVehicleById,
  getVehicleSummary,
  createVehicle,
  updateVehicle,
  toggleVehicle,
  deleteVehicle,
};