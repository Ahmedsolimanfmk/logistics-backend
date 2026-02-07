// =======================
// src/vehicles/vehicles.controller.js
// FINAL (fleet_no + plate_no, status default ACTIVE)
// + FIX: allow PATCH supervisor_id (Admin/HR only)
// =======================

const prisma = require("../prisma");

// normalize text (trim + uppercase + single spaces)
function normalizeText(input) {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
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

function getAuthRole(req) {
  return String(req.user?.role || "").toUpperCase();
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

// ✅ dropdown label: fleet_no - plate_no (fallbacks)
function buildVehicleLabel(v) {
  const fn = v.fleet_no ? String(v.fleet_no).trim() : "";
  const pn = v.plate_no ? String(v.plate_no).trim() : "";
  const dn = v.display_name ? String(v.display_name).trim() : "";
  if (fn && pn) return `${fn} - ${pn}`;
  return fn || pn || dn || v.id;
}

/**
 * GET /vehicles
 * query:
 *  - q
 *  - status
 *  - is_active=true|false
 *  - page
 *  - limit
 */
async function getVehicles(req, res) {
  try {
    const { q, status, is_active, page, limit, unassigned, supervisor_id } = req.query || {};
    const where = {};

    // --------- NEW: role awareness (for unassigned) ----------
    const role = getAuthRole(req);
    const userId = req.user?.sub || null;

    // unassigned=true => supervisor_id IS NULL (Admin/HR فقط)
    if (String(unassigned || "").toLowerCase() === "true") {
      if (role !== "ADMIN" && role !== "HR") {
        return res.status(403).json({ message: "Forbidden" });
      }
      where.supervisor_id = null;
    }

    // supervisor_id filter:
    // - لو Field Supervisor: يشوف عربياته فقط (حتى لو لم يرسل supervisor_id)
    // - لو Admin/HR: يقدر يفلتر بأي supervisor_id
    if (role === "FIELD_SUPERVISOR") {
      where.supervisor_id = userId;
    } else if (supervisor_id) {
      where.supervisor_id = String(supervisor_id).trim();
    }

    if (status) where.status = String(status).trim().toUpperCase();

    const isActiveParsed = parseBooleanQuery(is_active);
    if (typeof isActiveParsed === "boolean") where.is_active = isActiveParsed;

    if (q) {
      const query = String(q).trim();
      where.OR = [
        { fleet_no: { contains: query, mode: "insensitive" } },
        { plate_no: { contains: query, mode: "insensitive" } },
        { display_name: { contains: query, mode: "insensitive" } },
      ];
    }

    const pageNum = Math.max(1, parseIntQuery(page, 1));
    const limitNum = Math.min(100, Math.max(1, parseIntQuery(limit, 20)));
    const skip = (pageNum - 1) * limitNum;

    const [itemsRaw, total] = await Promise.all([
      prisma.vehicles.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limitNum,
        select: {
          id: true,
          fleet_no: true,
          plate_no: true,
          display_name: true,
          status: true,
          is_active: true,
          supervisor_id: true, // ✅ NEW
          current_odometer: true,
          gps_device_id: true,
          created_at: true,
          updated_at: true,
        },
      }),
      prisma.vehicles.count({ where }),
    ]);

    const items = itemsRaw.map((v) => ({
      ...v,
      value: v.id,
      label: buildVehicleLabel(v),
    }));

    return res.json({
      items,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (e) {
    console.log("GET VEHICLES ERROR:", e);
    return res.status(500).json({ message: "Failed to fetch vehicles", error: e.message });
  }
}

/**
 * GET /vehicles/:id
 */
async function getVehicleById(req, res) {
  try {
    const { id } = req.params;

    const vehicle = await prisma.vehicles.findUnique({ where: { id } });
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });

    return res.json({
      ...vehicle,
      value: vehicle.id,
      label: buildVehicleLabel(vehicle),
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch vehicle", error: e.message });
  }
}

/**
 * POST /vehicles
 * body: { fleet_no, plate_no, status?, display_name?, ... }
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
    } = req.body || {};

    if (!fleet_no) return res.status(400).json({ message: "fleet_no is required" });
    if (!plate_no) return res.status(400).json({ message: "plate_no is required" });

    const fleetNormalized = normalizeText(fleet_no);
    const plateNormalized = normalizeText(plate_no);

    let odometerValue = null;
    if (current_odometer !== undefined && current_odometer !== null) {
      const n = Number(current_odometer);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return res.status(400).json({ message: "current_odometer must be a non-negative integer" });
      }
      odometerValue = n;
    }

    let yearValue = null;
    if (year !== undefined && year !== null) {
      const n = Number(year);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return res.status(400).json({ message: "year must be an integer" });
      }
      yearValue = n;
    }

    const now = new Date();

    const vehicle = await prisma.vehicles.create({
      data: {
        fleet_no: fleetNormalized,
        plate_no: plateNormalized,
        status: status ? String(status).trim().toUpperCase() : "AVAILABLE",
        display_name: display_name ? String(display_name).trim() : null,
        model: model ? String(model).trim() : null,
        year: yearValue,
        current_odometer: odometerValue,
        gps_device_id: gps_device_id ? String(gps_device_id).trim() : null,
        is_active: typeof is_active === "boolean" ? is_active : true,
        created_at: now,
        updated_at: now,
      },
    });

    return res.status(201).json({
      ...vehicle,
      value: vehicle.id,
      label: buildVehicleLabel(vehicle),
    });
  } catch (e) {
    if (e.code === "P2002") {
      return res.status(409).json({ message: "fleet_no or plate_no already exists" });
    }
    console.log("CREATE VEHICLE ERROR:", e);
    return res.status(500).json({ message: "Failed to create vehicle", error: e.message });
  }
}

/**
 * PATCH /vehicles/:id
 */
async function updateVehicle(req, res) {
  try {
    const { id } = req.params;

    const exists = await prisma.vehicles.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: "Vehicle not found" });

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
      supervisor_id, // ✅ NEW
    } = body;

    const data = {};

    if (fleet_no !== undefined) {
      if (!fleet_no) return res.status(400).json({ message: "fleet_no cannot be empty" });
      data.fleet_no = normalizeText(fleet_no);
    }

    if (plate_no !== undefined) {
      if (!plate_no) return res.status(400).json({ message: "plate_no cannot be empty" });
      data.plate_no = normalizeText(plate_no);
    }

    if (status !== undefined) data.status = status ? String(status).trim().toUpperCase() : null;
    if (display_name !== undefined) data.display_name = display_name ? String(display_name).trim() : null;
    if (model !== undefined) data.model = model ? String(model).trim() : null;

    if (year !== undefined) {
      if (year === null) data.year = null;
      else {
        const n = Number(year);
        if (!Number.isFinite(n) || !Number.isInteger(n)) {
          return res.status(400).json({ message: "year must be an integer" });
        }
        data.year = n;
      }
    }

    if (current_odometer !== undefined) {
      if (current_odometer === null) data.current_odometer = null;
      else {
        const n = Number(current_odometer);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
          return res.status(400).json({ message: "current_odometer must be a non-negative integer" });
        }
        data.current_odometer = n;
      }
    }

    if (gps_device_id !== undefined) data.gps_device_id = gps_device_id ? String(gps_device_id).trim() : null;
    if (typeof is_active === "boolean") data.is_active = is_active;

    // ✅ FIX: allow supervisor_id update (Admin/HR only)
    // We check presence, so "null" unassign works.
    if (Object.prototype.hasOwnProperty.call(body, "supervisor_id")) {
      if (role !== "ADMIN" && role !== "HR") {
        return res.status(403).json({ message: "Forbidden (supervisor assignment is ADMIN/HR only)" });
      }

      if (supervisor_id === null) {
        data.supervisor_id = null;
      } else {
        const sid = String(supervisor_id || "").trim();
        if (!isUuid(sid)) return res.status(400).json({ message: "Invalid supervisor_id" });
        data.supervisor_id = sid;
      }
    }

    data.updated_at = new Date();

    const updated = await prisma.vehicles.update({ where: { id }, data });

    return res.json({
      ...updated,
      value: updated.id,
      label: buildVehicleLabel(updated),
    });
  } catch (e) {
    if (e.code === "P2002") {
      return res.status(409).json({ message: "fleet_no or plate_no already exists" });
    }
    return res.status(500).json({ message: "Failed to update vehicle", error: e.message });
  }
}

/**
 * PATCH /vehicles/:id/toggle
 */
async function toggleVehicle(req, res) {
  try {
    const { id } = req.params;

    const exists = await prisma.vehicles.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: "Vehicle not found" });

    const updated = await prisma.vehicles.update({
      where: { id },
      data: { is_active: !exists.is_active, updated_at: new Date() },
    });

    return res.json({
      ...updated,
      value: updated.id,
      label: buildVehicleLabel(updated),
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to toggle vehicle", error: e.message });
  }
}

/**
 * DELETE /vehicles/:id
 * (deactivate بدل حذف فعلي)
 */
async function deleteVehicle(req, res) {
  try {
    const { id } = req.params;

    const exists = await prisma.vehicles.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: "Vehicle not found" });

    const updated = await prisma.vehicles.update({
      where: { id },
      data: { is_active: false, updated_at: new Date() },
    });

    return res.json({ ok: true, vehicle: updated });
  } catch (e) {
    return res.status(500).json({ message: "Failed to delete/deactivate vehicle", error: e.message });
  }
}

module.exports = {
  getVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  toggleVehicle,
  deleteVehicle,
};
