// =======================
// src/auth/role.middleware.js
// =======================

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Forbidden",
        required: allowedRoles,
        current: req.user.role,
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

module.exports = {
  requireRole,
  requireAdmin,
  requireAdminOrHR,
};
