// src/auth/auth.routes.js

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../prisma");

const router = express.Router();

function normalizePlatformRole(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveEffectiveRole(user) {
  const platformRole = normalizePlatformRole(user?.platform_role);

  if (platformRole === "SUPER_ADMIN") {
    return "SUPER_ADMIN";
  }

  return String(user?.role || "").trim().toUpperCase();
}

// 🔐 LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        message: "email and password are required",
      });
    }

    const emailNorm = String(email).trim();

    const user = await prisma.users.findFirst({
      where: {
        email: { equals: emailNorm, mode: "insensitive" },
      },
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        platform_role: true,
        is_active: true,
        password_hash: true,
      },
    });

    if (!user || user.is_active === false) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Server misconfigured: JWT_SECRET missing",
      });
    }

    const effectiveRole = resolveEffectiveRole(user);
    const platformRole = normalizePlatformRole(user.platform_role) || "USER";

    // 🔥 membership
    const membership = await prisma.company_users.findFirst({
      where: {
        user_id: user.id,
        is_active: true,
        status: "ACTIVE",
      },
      select: {
  company_id: true,
  company: {
    select: { name: true },
  },
},
      orderBy: { joined_at: "asc" },
    });
let companyId = membership?.company_id || null;
let companyName = membership?.company?.name || null;

    if (!membership && platformRole !== "SUPER_ADMIN") {
      return res.status(403).json({
        message: "No active company membership found",
      });
    }

    let companyId = membership?.company_id || null;

    // ✅ SUPER ADMIN fallback
    if (!companyId && platformRole === "SUPER_ADMIN") {
      const defaultCompany = await prisma.companies.findFirst({
        select: { id: true },
      });

      companyId = defaultCompany?.id || null;
    }

    const token = jwt.sign(
      {
        sub: user.id,
        role: effectiveRole,
        effective_role: effectiveRole,
        platform_role: platformRole,
        company_id: companyId,
        company_name: companyName,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: effectiveRole,
        platform_role: platformRole,
        company_id: companyId,
        company_name: companyName,
      },
    });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    return res.status(500).json({
      message: "Login failed",
      error: e.message,
    });
  }
});
const { authRequired } = require("../auth/jwt.middleware");

// 🔁 SWITCH COMPANY
router.post("/switch-company", authRequired, async (req, res) => {
  try {
    const userId = req.user.sub;
    const { company_id } = req.body;

    if (!company_id) {
      return res.status(400).json({
        message: "company_id is required",
      });
    }

    // 🔥 تحقق إن المستخدم عضو في الشركة
    const membership = await prisma.company_users.findFirst({
      where: {
        user_id: userId,
        company_id,
        is_active: true,
        status: "ACTIVE",
      },
    });

    // ✅ SUPER ADMIN bypass
    if (!membership && req.user.platform_role !== "SUPER_ADMIN") {
      return res.status(403).json({
        message: "Not allowed in this company",
      });
    }

    const token = jwt.sign(
      {
        sub: userId,
        role: req.user.role,
        effective_role: req.user.effective_role,
        platform_role: req.user.platform_role,
        company_id,
        company_name: company?.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
const company = await prisma.companies.findUnique({
  where: { id: company_id },
  select: { name: true },
});
    return res.json({
      token,
      company_id,
      company_name: company?.name,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Switch failed",
      error: e.message,
    });
  }
});
// GET /auth/my-companies
router.get("/my-companies", authRequired, async (req, res) => {
  try {
    const userId = req.user.sub;
    const isSuperAdmin = req.user.platform_role === "SUPER_ADMIN";

    if (isSuperAdmin) {
      // السوبر أدمن يشوف كل الشركات
      const companies = await prisma.companies.findMany({
        select: { id: true, name: true },
        orderBy: { created_at: "desc" },
      });

      return res.json({ data: companies });
    }

    // المستخدم العادي: الشركات اللي هو عضو فيها
    const memberships = await prisma.company_users.findMany({
      where: {
        user_id: userId,
        is_active: true,
        status: "ACTIVE",
      },
      select: {
        company: {
          select: { id: true, name: true },
        },
      },
    });

    const companies = memberships.map((m) => m.company);

    return res.json({ data: companies });
  } catch (e) {
    return res.status(500).json({ message: "Failed to load companies" });
  }
});

module.exports = router;