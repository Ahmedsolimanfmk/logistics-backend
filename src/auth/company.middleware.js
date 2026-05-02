const { getUserRole } = require("./access");

async function requireCompany(req, res, next) {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 🧠 Debug (امسحه بعد ما تتأكد)
    console.log("JWT company:", user.company_id);
    console.log("HEADER company:", req.headers["x-company-id"]);

    // ✅ SUPER ADMIN
    if (user.platform_role === "SUPER_ADMIN") {
      req.companyId =
        user.company_id || req.headers["x-company-id"] || null;

      req.isSuperAdmin = true;

      if (!req.companyId) {
        return res.status(400).json({
          message: "Company context is missing",
        });
      }

      return next();
    }

    // ✅ normal users
    const companyId =
      user.company_id || req.headers["x-company-id"];

    if (!companyId) {
      return res.status(400).json({
        message: "Company context is missing",
      });
    }

    req.companyId = companyId;

    return next();
  } catch (error) {
    return res.status(500).json({
      message: "Failed to resolve company",
      error: error?.message || "Unknown error",
    });
  }
}

module.exports = { requireCompany };