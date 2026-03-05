// =======================
// src/trips/trip-permissions.middleware.js
// =======================

const prisma = require("../prisma");
const { ROLES } = require("../auth/roles");

function getAuthUserId(req) {
  return req.user?.sub || null;
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

// ✅ ADMIN: يسمح دائمًا
// ✅ FIELD_SUPERVISOR: يسمح فقط لو متعيّن على الرحلة (assignment الحالي is_active=true)
async function requireTripStartFinishPermission(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const role = getAuthRole(req);

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const tripId = req.params.id;
    if (!isUuid(tripId)) return res.status(400).json({ message: "Invalid trip id" });

    // ADMIN full access
    if (role === ROLES.ADMIN) return next();

    // only assigned field supervisor
    if (role !== ROLES.FIELD_SUPERVISOR) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const assignment = await prisma.trip_assignments.findFirst({
      where: {
        trip_id: tripId,
        field_supervisor_id: userId,
        is_active: true,
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