const { ROLES, PLATFORM_ROLES } = require("./roles");

function roleUpper(role) {
  return String(role || "").trim().toUpperCase();
}

function getUserId(reqOrUser) {
  const src = reqOrUser?.user ? reqOrUser.user : reqOrUser;
  return src?.sub || src?.id || src?.userId || null;
}

function getUserRole(reqOrUser) {
  const src = reqOrUser?.user ? reqOrUser.user : reqOrUser;

  const effectiveRole = roleUpper(src?.effective_role);
  if (effectiveRole) return effectiveRole;

  const platformRole = roleUpper(src?.platform_role);
  if (platformRole === PLATFORM_ROLES.SUPER_ADMIN) {
    return PLATFORM_ROLES.SUPER_ADMIN;
  }

  return roleUpper(src?.role);
}

function hasRole(userOrReq, ...allowedRoles) {
  const role = getUserRole(userOrReq);
  return allowedRoles.map(roleUpper).includes(role);
}

function isSuperAdmin(userOrReq) {
  return hasRole(userOrReq, PLATFORM_ROLES.SUPER_ADMIN);
}

function isAdmin(userOrReq) {
  return hasRole(userOrReq, ROLES.ADMIN, PLATFORM_ROLES.SUPER_ADMIN);
}

function isAdminOrHR(userOrReq) {
  return hasRole(userOrReq, ROLES.ADMIN, ROLES.HR, PLATFORM_ROLES.SUPER_ADMIN);
}

function isAdminOrAccountant(userOrReq) {
  return hasRole(
    userOrReq,
    ROLES.ADMIN,
    ROLES.ACCOUNTANT,
    PLATFORM_ROLES.SUPER_ADMIN
  );
}

function isAdminOrStorekeeper(userOrReq) {
  return hasRole(
    userOrReq,
    ROLES.ADMIN,
    ROLES.STOREKEEPER,
    PLATFORM_ROLES.SUPER_ADMIN
  );
}

function isFieldSupervisor(userOrReq) {
  return hasRole(userOrReq, ROLES.FIELD_SUPERVISOR, PLATFORM_ROLES.SUPER_ADMIN);
}

function isOperations(userOrReq) {
  return hasRole(userOrReq, ROLES.OPERATIONS, PLATFORM_ROLES.SUPER_ADMIN);
}

function isMaintenanceManager(userOrReq) {
  return hasRole(
    userOrReq,
    ROLES.MAINTENANCE_MANAGER,
    PLATFORM_ROLES.SUPER_ADMIN
  );
}

function isAdminOrContractManager(userOrReq) {
  return hasRole(
    userOrReq,
    ROLES.ADMIN,
    ROLES.CONTRACT_MANAGER,
    PLATFORM_ROLES.SUPER_ADMIN
  );
}

function canManageTripRevenue(userOrReq) {
  return hasRole(
    userOrReq,
    ROLES.ADMIN,
    ROLES.CONTRACT_MANAGER,
    PLATFORM_ROLES.SUPER_ADMIN
  );
}

function canViewTripProfitability(userOrReq) {
  return hasRole(
    userOrReq,
    ROLES.ADMIN,
    ROLES.ACCOUNTANT,
    PLATFORM_ROLES.SUPER_ADMIN
  );
}

function canManageContractPricing(userOrReq) {
  return hasRole(
    userOrReq,
    ROLES.ADMIN,
    ROLES.CONTRACT_MANAGER,
    PLATFORM_ROLES.SUPER_ADMIN
  );
}

function canManageMasterData(userOrReq) {
  return hasRole(
    userOrReq,
    ROLES.ADMIN,
    ROLES.CONTRACT_MANAGER,
    ROLES.MAINTENANCE_MANAGER,
    PLATFORM_ROLES.SUPER_ADMIN
  );
}

function canManageRoutesAndZones(userOrReq) {
  return hasRole(
    userOrReq,
    ROLES.ADMIN,
    ROLES.CONTRACT_MANAGER,
    ROLES.OPERATIONS,
    PLATFORM_ROLES.SUPER_ADMIN
  );
}

function assertRole(userOrReq, ...allowedRoles) {
  const ok = hasRole(userOrReq, ...allowedRoles);
  if (!ok) {
    const err = new Error("Forbidden");
    err.statusCode = 403;
    err.details = {
      required: allowedRoles,
      current: getUserRole(userOrReq),
    };
    throw err;
  }
  return true;
}

module.exports = {
  roleUpper,
  getUserId,
  getUserRole,
  hasRole,
  isSuperAdmin,
  isAdmin,
  isAdminOrHR,
  isAdminOrAccountant,
  isAdminOrStorekeeper,
  isFieldSupervisor,
  isOperations,
  isMaintenanceManager,
  isAdminOrContractManager,
  canManageTripRevenue,
  canViewTripProfitability,
  canManageContractPricing,
  canManageMasterData,
  canManageRoutesAndZones,
  assertRole,
};