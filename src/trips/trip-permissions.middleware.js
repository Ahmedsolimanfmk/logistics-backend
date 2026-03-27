const prisma = require("../prisma");
const { ROLES } = require("../auth/roles");

function getAuthUserId(req) {
  return req.user?.sub || req.user?.id || null;
}

function getAuthRole(req) {
  return String(req.user?.role || "").trim().toUpperCase();
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function canManageAllTrips(role) {
  return [
    ROLES.ADMIN,
    ROLES.OPERATIONS,
    ROLES.GENERAL_SUPERVISOR,
    ROLES.DEPT_MANAGER,
    ROLES.GENERAL_MANAGER,
    ROLES.GENERAL_RESPONSIBLE,
  ].includes(role);
}

async function requireTripStartFinishPermission(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const role = getAuthRole(req);
    const tripId = req.params?.id;

    if (!isUuid(tripId)) {
      return res.status(400).json({ message: "Invalid trip id" });
    }

    // أدوار الإدارة والتشغيل المسموح لها على كل الرحلات
    if (canManageAllTrips(role)) {
      return next();
    }

    // المشرف الميداني: لازم يكون متعيّن على الرحلة
    if (role === ROLES.FIELD_SUPERVISOR) {
      const assignment = await prisma.trip_assignments.findFirst({
        where: {
          trip_id: tripId,
          field_supervisor_id: userId,
          is_active: true,
        },
        select: {
          id: true,
        },
      });

      if (!assignment) {
        return res.status(403).json({
          message: "Forbidden: you are not assigned to this trip",
        });
      }

      return next();
    }

    return res.status(403).json({ message: "Forbidden" });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to verify trip permission",
      error: error?.message || "Unknown error",
    });
  }
}

module.exports = {
  requireTripStartFinishPermission,
};