// src/trips/trips.controller.js

const prisma = require("../prisma");
const { ROLES } = require("../auth/roles");

// =======================
// Helpers
// =======================
function getAuthUserId(req) {
  // JWT payload: { sub, role, iat, exp }
  return req.user?.sub || null;
}

function getAuthRole(req) {
  return req.user?.role || "";
}

function canViewAllTrips(role) {
  return [
    ROLES.ADMIN,
    ROLES.GENERAL_SUPERVISOR,
    ROLES.DEPT_MANAGER,
    ROLES.GENERAL_MANAGER,
    ROLES.GENERAL_RESPONSIBLE,
  ].includes(role);
}

function canAccessTrips(role) {
  // allowed roles to access trips module at all
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

// =======================
// GET /trips
// =======================
async function getTrips(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = String(getAuthRole(req)).toUpperCase();
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || "25", 10), 1), 100);
    const skip = (page - 1) * pageSize;

    const where = {};

    // status filter (single or list)
    const statusList = parseStatusList(req.query.status);
    if (statusList && statusList.length === 1) where.status = statusList[0];
    if (statusList && statusList.length > 1) where.status = { in: statusList };

    // range=today (على created_at)
    if (String(req.query.range || "").toLowerCase() === "today") {
      const { start, end } = dayRangeLocal(new Date());
      where.created_at = { gte: start, lte: end };
    }

    // financial_closed_at=null => IS NULL
    if (String(req.query.financial_closed_at || "").toLowerCase() === "null") {
      where.financial_closed_at = null;
    }

    // Role-based visibility
    if (canViewAllTrips(role)) {
      // no extra filter
    } else if (role === ROLES.FIELD_SUPERVISOR) {
      where.trip_assignments = { some: { field_supervisor_id: userId } };
    }

    // 1) Trips list (خفيفة بدون trip_assignments)
    const [trips, total] = await Promise.all([
      prisma.trips.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          status: true,
          financial_status: true,
          created_at: true,
          scheduled_at: true,
          trip_type: true,
          notes: true,
          client_id: true,
          site_id: true,
          financial_closed_at: true,

          clients: { select: { id: true, name: true } },
          sites: { select: { id: true, name: true } },
        },
      }),
      prisma.trips.count({ where }),
    ]);

    const tripIds = trips.map((t) => t.id);
    if (tripIds.length === 0) return res.json({ page, pageSize, total, items: [] });

    // 2) Latest assignment لكل Trip في Query واحدة
    const latestAssignments = await prisma.trip_assignments.findMany({
      where: { trip_id: { in: tripIds } },
      orderBy: { assigned_at: "desc" },
      distinct: ["trip_id"], // ✅ مهم جدًا: ياخد أحدث assignment لكل trip_id
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
          },
        },
        drivers: {
          select: {
            id: true,
            full_name: true,
            phone: true,
          },
        },
        users_trip_assignments_supervisor: {
          select: {
            id: true,
            full_name: true,
          },
        },
      },
    });

    const assignmentByTripId = new Map(latestAssignments.map((a) => [a.trip_id, a]));

    // 3) دمج النتائج
    const items = trips.map((t) => ({
      ...t,
      trip_assignments: assignmentByTripId.get(t.id) ? [assignmentByTripId.get(t.id)] : [],
    }));

    return res.json({ page, pageSize, total, items });
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch trips", error: e.message });
  }
}

// =======================
// GET /trips/:id
// =======================
async function getTripById(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = String(getAuthRole(req)).toUpperCase();
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid trip id" });

    const trip = await prisma.trips.findUnique({
      where: { id },
      include: {
        clients: true,
        sites: true,
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
      },
    });

    if (!trip) return res.status(404).json({ message: "Trip not found" });

    // FIELD_SUPERVISOR can access only if assigned as supervisor
    if (role === ROLES.FIELD_SUPERVISOR) {
      const ok = (trip.trip_assignments || []).some((a) => a.field_supervisor_id === userId);
      if (!ok) return res.status(403).json({ message: "Forbidden" });
    }

    return res.json(trip);
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch trip", error: e.message });
  }
}

// =======================
// POST /trips
// =======================
async function createTrip(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = String(getAuthRole(req)).toUpperCase();
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const { client_id, site_id, scheduled_at, trip_type, notes } = req.body || {};

    if (!isUuid(client_id)) return res.status(400).json({ message: "Invalid client_id" });
    if (!isUuid(site_id)) return res.status(400).json({ message: "Invalid site_id" });

    // ✅ المشرف هو المسؤول عن إنشاء رحلات التشغيل
    // ✅ ومسموح للإدارات العليا (اختياري)
    if (role === ROLES.FIELD_SUPERVISOR) {
      // ok
    } else if (canViewAllTrips(role)) {
      // ok (اختياري)
    } else {
      return res.status(403).json({ message: "Forbidden" });
    }

    const created = await prisma.trips.create({
      data: {
        client_id,
        site_id,
        created_by: userId,
        scheduled_at: scheduled_at ? new Date(scheduled_at) : null,
        trip_type: trip_type || null,
        notes: notes || null,
        status: "DRAFT",
        financial_status: "OPEN",
      },
      include: { clients: true, sites: true },
    });

    return res.status(201).json(created);
  } catch (e) {
    return res.status(500).json({ message: "Failed to create trip", error: e.message });
  }
}

// =======================
// POST /trips/:id/assign
// =======================
async function assignTrip(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = String(getAuthRole(req)).toUpperCase();
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
      return res.status(400).json({ message: `Trip must be DRAFT to assign (current=${trip.status})` });
    }

    // =========================================================
    // ✅ NEW GUARDS (Driver must exist + must be active)
    // =========================================================
    const driver = await prisma.drivers.findUnique({ where: { id: driver_id } });
    if (!driver) return res.status(400).json({ message: "Driver not found" });
    if (!driver.is_active) return res.status(400).json({ message: "Cannot assign inactive driver" });

    // ✅ OPTIONAL: Vehicle must exist + must be AVAILABLE + active
    const vehicle = await prisma.vehicles.findUnique({ where: { id: vehicle_id } });
    if (!vehicle) return res.status(400).json({ message: "Vehicle not found" });

    // لو عندك is_active في vehicles
    if (typeof vehicle.is_active === "boolean" && !vehicle.is_active) {
      return res.status(400).json({ message: "Cannot assign inactive vehicle" });
    }

    // لو عندك status في vehicles
    if (vehicle.status && String(vehicle.status).toUpperCase() !== "AVAILABLE") {
      return res.status(400).json({ message: `Vehicle not AVAILABLE (current=${vehicle.status})` });
    }

    // ✅ OPTIONAL: prevent busy driver/vehicle (already assigned somewhere else)
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
      return res.status(400).json({ message: "Driver is already assigned to another active trip" });
    }
    if (busyVehicle) {
      return res.status(400).json({ message: "Vehicle is already assigned to another active trip" });
    }
    // =========================================================

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
          payload: { vehicle_id, driver_id, field_supervisor_id: field_supervisor_id || null },
        },
      });

      return { trip: t, assignment: a };
    });

    return res.json({ message: "Assigned", ...updated });
  } catch (e) {
    return res.status(500).json({ message: "Failed to assign trip", error: e.message });
  }
}

// =======================
// POST /trips/:id/start
// =======================
async function startTrip(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = String(getAuthRole(req)).toUpperCase();
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid trip id" });

    const trip = await prisma.trips.findUnique({
      where: { id },
      include: { trip_assignments: { where: { is_active: true }, take: 1 } },
    });
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (trip.status !== "ASSIGNED") {
      return res.status(400).json({ message: `Trip must be ASSIGNED to start (current=${trip.status})` });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.trips.update({
        where: { id },
        data: { status: "IN_PROGRESS" },
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
    return res.status(500).json({ message: "Failed to start trip", error: e.message });
  }
}

// =======================
// POST /trips/:id/finish
// =======================
async function finishTrip(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = String(getAuthRole(req)).toUpperCase();
    if (!canAccessTrips(role)) return res.status(403).json({ message: "Forbidden" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid trip id" });

    const trip = await prisma.trips.findUnique({ where: { id } });
    if (!trip) return res.status(404).json({ message: "Trip not found" });

    if (trip.status !== "IN_PROGRESS") {
      return res.status(400).json({ message: `Trip must be IN_PROGRESS to finish (current=${trip.status})` });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.trip_assignments.updateMany({
        where: { trip_id: id, is_active: true },
        data: { is_active: false, unassigned_at: new Date() },
      });

      const t = await tx.trips.update({
        where: { id },
        data: { status: "COMPLETED" },
      });

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

    return res.json({ message: "Finished", trip: updated });
  } catch (e) {
    return res.status(500).json({ message: "Failed to finish trip", error: e.message });
  }
}

module.exports = {
  getTrips,
  getTripById,
  createTrip,
  assignTrip,
  startTrip,
  finishTrip,
};
