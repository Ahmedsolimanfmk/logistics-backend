// =======================
// src/supervisors/supervisors.controller.js
// =======================

const prisma = require("../prisma");
const { ROLES } = require("../auth/roles");

function getAuthRole(req) {
  return String(req.user?.role || "").toUpperCase();
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

// GET /supervisors
async function listSupervisors(req, res) {
  try {
    const role = getAuthRole(req);
    if (role !== ROLES.ADMIN && role !== ROLES.HR) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const q = String(req.query.q || "").trim();

    const where = {
      role: ROLES.FIELD_SUPERVISOR,
      ...(q
        ? {
            OR: [
              { full_name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const items = await prisma.users.findMany({
      where,
      orderBy: [{ is_active: "desc" }, { full_name: "asc" }, { created_at: "desc" }],
      select: {
        id: true,
        full_name: true,
        phone: true,
        email: true,
        role: true,
        is_active: true,
        created_at: true,
      },
    });

    return res.json({ items, total: items.length });
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch supervisors", error: e.message });
  }
}

// GET /supervisors/:id/vehicles
async function getSupervisorVehicles(req, res) {
  try {
    const role = getAuthRole(req);
    if (role !== ROLES.ADMIN && role !== ROLES.HR) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid supervisor id" });

    const sup = await prisma.users.findUnique({ where: { id } });
    if (!sup || String(sup.role || "").toUpperCase() !== ROLES.FIELD_SUPERVISOR) {
      return res.status(404).json({ message: "Supervisor not found" });
    }

    const items = await prisma.vehicles.findMany({
      where: { supervisor_id: id },
      orderBy: [{ is_active: "desc" }, { created_at: "desc" }],
      select: {
        id: true,
        fleet_no: true,
        plate_no: true,
        display_name: true,
        status: true,
        is_active: true,
        supervisor_id: true,
        created_at: true,
      },
    });

    return res.json({ items, total: items.length });
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch supervisor vehicles", error: e.message });
  }
}

// POST /supervisors/:id/assign-vehicle  body: { vehicle_id }
async function assignVehicle(req, res) {
  try {
    const role = getAuthRole(req);
    if (role !== ROLES.ADMIN && role !== ROLES.HR) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { id } = req.params;
    const { vehicle_id } = req.body || {};

    if (!isUuid(id)) return res.status(400).json({ message: "Invalid supervisor id" });
    if (!isUuid(vehicle_id)) return res.status(400).json({ message: "Invalid vehicle_id" });

    const sup = await prisma.users.findUnique({ where: { id } });
    if (!sup || String(sup.role || "").toUpperCase() !== ROLES.FIELD_SUPERVISOR) {
      return res.status(404).json({ message: "Supervisor not found" });
    }

    const vehicle = await prisma.vehicles.findUnique({ where: { id: vehicle_id } });
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    if (vehicle.is_active === false) return res.status(400).json({ message: "Cannot assign inactive vehicle" });

    // عربية لمشرف واحد فقط
    if (vehicle.supervisor_id && vehicle.supervisor_id !== id) {
      return res.status(400).json({ message: "Vehicle is already assigned to another supervisor" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      // تحديث vehicles.supervisor_id
      const v = await tx.vehicles.update({
        where: { id: vehicle_id },
        data: { supervisor_id: id, updated_at: new Date() },
      });

      // (اختياري) سجل في vehicle_portfolio كـ log
      // هنقفل أي سجل نشط لنفس العربية
      await tx.vehicle_portfolio.updateMany({
        where: { vehicle_id, is_active: true },
        data: { is_active: false, updated_at: new Date() },
      });

      await tx.vehicle_portfolio.create({
        data: {
          vehicle_id,
          field_supervisor_id: id,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      return v;
    });

    return res.json({ message: "Vehicle assigned", vehicle: updated });
  } catch (e) {
    return res.status(500).json({ message: "Failed to assign vehicle", error: e.message });
  }
}

// POST /supervisors/:id/unassign-vehicle  body: { vehicle_id }
async function unassignVehicle(req, res) {
  try {
    const role = getAuthRole(req);
    if (role !== ROLES.ADMIN && role !== ROLES.HR) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { id } = req.params;
    const { vehicle_id } = req.body || {};

    if (!isUuid(id)) return res.status(400).json({ message: "Invalid supervisor id" });
    if (!isUuid(vehicle_id)) return res.status(400).json({ message: "Invalid vehicle_id" });

    const vehicle = await prisma.vehicles.findUnique({ where: { id: vehicle_id } });
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });

    if (vehicle.supervisor_id !== id) {
      return res.status(400).json({ message: "Vehicle is not assigned to this supervisor" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const v = await tx.vehicles.update({
        where: { id: vehicle_id },
        data: { supervisor_id: null, updated_at: new Date() },
      });

      // اغلاق سجل portfolio النشط
      await tx.vehicle_portfolio.updateMany({
        where: { vehicle_id, field_supervisor_id: id, is_active: true },
        data: { is_active: false, updated_at: new Date() },
      });

      return v;
    });

    return res.json({ message: "Vehicle unassigned", vehicle: updated });
  } catch (e) {
    return res.status(500).json({ message: "Failed to unassign vehicle", error: e.message });
  }
}

module.exports = {
  listSupervisors,
  getSupervisorVehicles,
  assignVehicle,
  unassignVehicle,
};
