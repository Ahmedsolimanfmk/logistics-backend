// src/trips/trip-permissions.middleware.js

const prisma = require("../prisma");
const { ROLES } = require("../auth/roles");

function getAuthUserId(req) {
  return req.user?.sub || null;
}

function getAuthRole(req) {
  return String(req.user?.role || "").toUpperCase();
}

// ✅ ADMIN: يسمح دائمًا
// ✅ FIELD_SUPERVISOR: يسمح فقط لو متعيّن على الرحلة (assignment الحالي is_active=true)
async function requireTripStartFinishPermission(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // ADMIN full access
    if (role === ROLES.ADMIN) return next();

    // only assigned field supervisor
    if (role !== ROLES.FIELD_SUPERVISOR) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const tripId = req.params.id;

    const assignment = await prisma.trip_assignments.findFirst({
      where: {
        trip_id: tripId,
        field_supervisor_id: userId,
        is_active: true, // المشرف الحالي فقط
      },
      select: { id: true },
    });

    if (!assignment) return res.status(403).json({ message: "Forbidden" });

    return next();
  } catch (e) {
    return res.status(500).json({ message: "Permission check failed", error: e.message });
  }
}

module.exports = { requireTripStartFinishPermission };
