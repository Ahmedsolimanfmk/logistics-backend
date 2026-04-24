const prisma = require("../prisma");

function getAuthUserId(req) {
  return req?.user?.sub || req?.user?.id || req?.user?.userId || null;
}

function roleUpper(role) {
  return String(role || "").toUpperCase();
}

function getRole(reqOrUser) {
  return roleUpper(
    reqOrUser?.user?.role ||
      reqOrUser?.user?.effective_role ||
      reqOrUser?.user?.platform_role ||
      reqOrUser?.role ||
      reqOrUser?.effective_role ||
      reqOrUser?.platform_role
  );
}

function isAdminOrAccountant(reqOrUser) {
  const role = getRole(reqOrUser);
  return ["ADMIN", "ACCOUNTANT", "SUPER_ADMIN"].includes(role);
}

async function assertVehicleInSupervisorPortfolio({
  vehicle_id,
  userId,
  companyId,
}) {
  const row = await prisma.vehicle_portfolio.findFirst({
    where: {
      company_id: companyId,
      vehicle_id,
      field_supervisor_id: userId,
      is_active: true,
    },
    select: { id: true },
  });

  return !!row;
}

async function assertMaintenanceVehicleAccess({ req, vehicleId }) {
  const userId = getAuthUserId(req);
  const companyId = req?.companyId || null;

  if (!userId) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }

  if (!companyId) {
    const err = new Error("Company context missing");
    err.statusCode = 403;
    throw err;
  }

  if (isAdminOrAccountant(req)) {
    return true;
  }

  const ok = await assertVehicleInSupervisorPortfolio({
    vehicle_id: vehicleId,
    userId,
    companyId,
  });

  if (!ok) {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    throw err;
  }

  return true;
}

module.exports = {
  getRole,
  isAdminOrAccountant,
  assertVehicleInSupervisorPortfolio,
  assertMaintenanceVehicleAccess,
};