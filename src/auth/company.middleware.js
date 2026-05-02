// src/auth/company.middleware.js

async function requireCompany(req, res, next) {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 🔥 SUPER ADMIN
    if (user.platform_role === "SUPER_ADMIN") {
      req.companyId = user.company_id || null;
      req.isSuperAdmin = true;
      return next();
    }

    // 👤 normal users
    if (!user.company_id) {
      return res.status(403).json({
        message: "No company assigned in token",
      });
    }

    req.companyId = user.company_id;

    return next();
  } catch (error) {
    return res.status(500).json({
      message: "Failed to resolve company",
      error: error?.message || "Unknown error",
    });
  }
}

module.exports = { requireCompany };