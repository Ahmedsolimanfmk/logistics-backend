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

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
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

    const hash = user.password_hash;
    if (!hash) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(String(password), String(hash));
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

    const token = jwt.sign(
      {
        sub: user.id,
        role: effectiveRole,
        effective_role: effectiveRole,
        platform_role: platformRole,
        email: user.email || undefined,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      _build: "AUTH_LOGIN_V4_PLATFORM_ROLE_2026-03-31",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: effectiveRole,
        effective_role: effectiveRole,
        platform_role: platformRole,
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

module.exports = router;