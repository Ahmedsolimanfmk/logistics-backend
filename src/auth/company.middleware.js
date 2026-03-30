const prisma = require("../prisma");

async function requireCompany(req, res, next) {
  try {
    const userId = req.user?.sub || req.user?.id || null;
    const userRole = String(req.user?.role || "").toUpperCase();

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ✅ SUPER ADMIN BYPASS
    if (userRole === "SUPER_ADMIN") {
      const defaultCompany = await prisma.companies.findFirst({
        where: { code: "COMP-DEFAULT" },
        select: { id: true },
      });

      if (!defaultCompany) {
        return res.status(500).json({
          message: "Default company not found",
        });
      }

      req.companyId = defaultCompany.id;
      req.isSuperAdmin = true;

      return next();
    }

    // 👇 السلوك الطبيعي
    const membership = await prisma.company_users.findFirst({
      where: {
        user_id: userId,
        is_active: true,
        status: "ACTIVE",
      },
      select: {
        company_id: true,
      },
      orderBy: {
        joined_at: "asc",
      },
    });

    if (!membership?.company_id) {
      return res.status(403).json({
        message: "No active company membership found",
      });
    }

    req.companyId = membership.company_id;
    return next();
  } catch (error) {
    return res.status(500).json({
      message: "Failed to resolve company",
      error: error?.message || "Unknown error",
    });
  }
}

module.exports = { requireCompany };