// src/auth/access.js

const { ROLES } = require("./roles");

function roleUpper(role) {
  return String(role || "").trim().toUpperCase();
}

function getUserId(reqOrUser) {
  const src = reqOrUser?.user ? reqOrUser.user : reqOrUser;
  return src?.sub || src?.id || src?.userId || null;
}

function getUserRole(reqOrUser) {
  const src = reqOrUser?.user ? reqOrUser.user : reqOrUser;
  return roleUpper(src?.role);
}

function hasRole(userOrReq, ...allowedRoles) {
  const role = getUserRole(userOrReq);
  return allowedRoles.map(roleUpper).includes(role);
}

function isAdmin(userOrReq) {
  return hasRole(userOrReq, ROLES.ADMIN);
}

function isAdminOrHR(userOrReq) {
  return hasRole(userOrReq, ROLES.ADMIN, ROLES.HR);
}

function isAdminOrAccountant(userOrReq) {
  return hasRole(userOrReq, ROLES.ADMIN, ROLES.ACCOUNTANT);
}

function isAdminOrStorekeeper(userOrReq) {
  return hasRole(userOrReq, ROLES.ADMIN, ROLES.STOREKEEPER);
}

function isFieldSupervisor(userOrReq) {
  return hasRole(userOrReq, ROLES.FIELD_SUPERVISOR);
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
  isAdmin,
  isAdminOrHR,
  isAdminOrAccountant,
  isAdminOrStorekeeper,
  isFieldSupervisor,
  assertRole,
};