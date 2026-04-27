const prisma = require("../prisma");
const { ROLES, PLATFORM_ROLES } = require("../auth/roles");

function getAuthUserId(req) {
  return req.user?.sub || req.user?.id || null;
}

function getAuthRole(req) {
  return String(req.user?.role || "").trim().toUpperCase();
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
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
    PLATFORM_ROLES.SUPER_ADMIN,
  ].includes(role);
}

async function requireTripStartFinishPermission(req, res, next) {
  try {
    const userId = getAuthUserId(req);
    const companyId = req.companyId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!companyId) {
      return res.status(403).json({ message: "Company context missing" });
    }

    const role = getAuthRole(req);
    const tripId = req.params?.id;

    if (!isUuid(tripId)) {
      return res.status(400).json({ message: "Invalid trip id" });
    }

    if (canManageAllTrips(role)) {
      const trip = await prisma.trips.findFirst({
        where: {
          id: tripId,
          company_id: companyId,
        },
        select: { id: true },
      });

      if (!trip) {
        return res.status(404).json({ message: "Trip not found" });
      }

      return next();
    }

    if (role === ROLES.FIELD_SUPERVISOR) {
      const assignment = await prisma.trip_assignments.findFirst({
        where: {
          company_id: companyId,
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