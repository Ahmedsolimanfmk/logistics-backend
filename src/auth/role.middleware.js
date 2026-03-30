const { getUserRole } = require("./access");

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const current = String(getUserRole(req)).toUpperCase();

    // ✅ SUPER ADMIN BYPASS
    if (current === "SUPER_ADMIN") {
      return next();
    }

    if (!allowedRoles.map((x) => String(x).toUpperCase()).includes(current)) {
      return res.status(403).json({
        message: "Forbidden",
        required: allowedRoles,
        current,
      });
    }

    next();
  };
}

function requireAdmin(req, res, next) {
  return requireRole("ADMIN")(req, res, next);
}

function requireAdminOrHR(req, res, next) {
  return requireRole("ADMIN", "HR")(req, res, next);
}

function requireAdminOrAccountant(req, res, next) {
  return requireRole("ADMIN", "ACCOUNTANT")(req, res, next);
}

function requireAdminOrStorekeeper(req, res, next) {
  return requireRole("ADMIN", "STOREKEEPER")(req, res, next);
}

module.exports = {
  requireRole,
  requireAdmin,
  requireAdminOrHR,
  requireAdminOrAccountant,
  requireAdminOrStorekeeper,
};