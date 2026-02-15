// =======================
// src/auth/auth.routes.js
// =======================

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../prisma");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    // ✅ Normalize email (trim only)
    // IMPORTANT: DB قد تحتوي Email بحروف كبيرة (Ahmed...)
    // لذلك لا نعتمد على toLowerCase، ونستخدم lookup insensitive
    const emailNorm = String(email).trim();

    // ✅ Case-insensitive lookup
    const user = await prisma.users.findFirst({
      where: {
        email: { equals: emailNorm, mode: "insensitive" },
      },
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
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
      return res
        .status(500)
        .json({ message: "Server misconfigured: JWT_SECRET missing" });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, email: user.email || undefined },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      _build: "AUTH_LOGIN_V3_2026-02-15",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    return res.status(500).json({ message: "Login failed", error: e.message });
  }
});

module.exports = router;
