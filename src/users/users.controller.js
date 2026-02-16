// =======================
// src/users/users.controller.js (SCHEMA-MATCHED)
// =======================

const bcrypt = require("bcrypt");
const prisma = require("../prisma");

// ---------- Normalizers ----------
function normalizeEmail(email) {
  const v = String(email || "").trim();
  if (!v) return null;
  return v.toLowerCase();
}

function normalizePhone(phone) {
  const v = String(phone || "").trim();
  return v ? v : null;
}

function normalizeRole(role) {
  const v = String(role || "").trim();
  return v ? v.toUpperCase() : null;
}

// ---------- Safe Select ----------
function safeUserSelect() {
  return {
    id: true,
    full_name: true,
    phone: true,
    email: true,
    role: true,
    is_active: true,
    created_at: true,
    updated_at: true, // ✅ موجودة في schema (@updatedAt)
  };
}

// ---------- Prisma error helper ----------
function handlePrismaUnique(e, res) {
  if (e?.code === "P2002") {
    const target = Array.isArray(e.meta?.target) ? e.meta.target.join(",") : String(e.meta?.target || "");
    return res.status(409).json({
      message: "Duplicate value",
      field: target || undefined,
    });
  }
  return null;
}

// =======================
// GET /users
// Query: q, role, is_active, take, skip
// =======================
async function listUsers(req, res) {
  try {
    const { q, role, is_active, take, skip } = req.query;
    const where = {};

    if (q) {
      const query = String(q).trim();
      if (query) {
        where.OR = [
          { full_name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } },
        ];
      }
    }

    if (role) {
      const rr = normalizeRole(role);
      if (rr) where.role = rr;
    }

    // ✅ only accept true/false
    if (is_active === "true") where.is_active = true;
    else if (is_active === "false") where.is_active = false;

    const takeN = take ? Math.min(Math.max(Number(take), 1), 200) : 50;
    const skipN = skip ? Math.max(Number(skip), 0) : 0;

    const [items, total] = await Promise.all([
      prisma.users.findMany({
        where,
        select: safeUserSelect(),
        orderBy: [{ is_active: "desc" }, { created_at: "desc" }],
        take: takeN,
        skip: skipN,
      }),
      prisma.users.count({ where }),
    ]);

    return res.json({ items, total });
  } catch (e) {
    return res.status(500).json({ message: "Failed to list users", error: e.message });
  }
}

// =======================
// GET /users/:id
// =======================
async function getUserById(req, res) {
  try {
    const id = String(req.params.id);

    const user = await prisma.users.findUnique({
      where: { id },
      select: safeUserSelect(),
    });

    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ data: user });
  } catch (e) {
    return res.status(500).json({ message: "Failed to get user", error: e.message });
  }
}

// =======================
// POST /users
// body: { full_name, phone?, email?, role, password }
// schema: password_hash is REQUIRED ✅
// =======================
async function createUser(req, res) {
  try {
    const { full_name, phone, email, role, password } = req.body ?? {};

    if (!full_name || !role || !password) {
      return res.status(400).json({ message: "full_name, role, password are required" });
    }

    const roleNorm = normalizeRole(role);
    if (!roleNorm) return res.status(400).json({ message: "role is invalid" });

    const emailNorm = email !== undefined ? normalizeEmail(email) : null;
    const phoneNorm = phone !== undefined ? normalizePhone(phone) : null;

    if (String(password).length < 6) {
      return res.status(400).json({ message: "password must be at least 6 characters" });
    }

    const password_hash = await bcrypt.hash(String(password), 10);

    const created = await prisma.users.create({
      data: {
        full_name: String(full_name).trim(),
        phone: phoneNorm,
        email: emailNorm,
        role: roleNorm,
        is_active: true,
        password_hash,
        // ✅ created_at/updated_at managed by DB/schema
      },
      select: safeUserSelect(),
    });

    return res.status(201).json({ data: created });
  } catch (e) {
    const handled = handlePrismaUnique(e, res);
    if (handled) return;
    return res.status(500).json({ message: "Failed to create user", error: e.message });
  }
}

// =======================
// PATCH /users/:id
// body: { full_name?, phone?, email?, role? }
// =======================
async function updateUser(req, res) {
  try {
    const id = String(req.params.id);
    const { full_name, phone, email, role } = req.body ?? {};

    const data = {};
    if (full_name !== undefined) data.full_name = String(full_name).trim();
    if (phone !== undefined) data.phone = normalizePhone(phone);
    if (email !== undefined) data.email = normalizeEmail(email);
    if (role !== undefined) data.role = normalizeRole(role);

    if (role !== undefined && !data.role) {
      return res.status(400).json({ message: "role is invalid" });
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const updated = await prisma.users.update({
      where: { id },
      data,
      select: safeUserSelect(),
    });

    return res.json({ data: updated });
  } catch (e) {
    const handled = handlePrismaUnique(e, res);
    if (handled) return;
    return res.status(500).json({ message: "Failed to update user", error: e.message });
  }
}

// =======================
// PATCH /users/:id/status
// body: { is_active: true|false }
// =======================
async function setUserStatus(req, res) {
  try {
    const id = String(req.params.id);
    const { is_active } = req.body ?? {};

    if (typeof is_active !== "boolean") {
      return res.status(400).json({ message: "is_active must be boolean" });
    }

    const updated = await prisma.users.update({
      where: { id },
      data: { is_active },
      select: safeUserSelect(),
    });

    return res.json({ data: updated });
  } catch (e) {
    return res.status(500).json({ message: "Failed to change status", error: e.message });
  }
}

// =======================
// POST /users/:id/reset-password
// body: { newPassword }
// =======================
async function resetUserPassword(req, res) {
  try {
    const id = String(req.params.id);
    const { newPassword } = req.body ?? {};

    if (!newPassword) {
      return res.status(400).json({ message: "newPassword is required" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "newPassword must be at least 6 characters" });
    }

    const hash = await bcrypt.hash(String(newPassword), 10);

    await prisma.users.update({
      where: { id },
      data: { password_hash: hash },
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: "Failed to reset password", error: e.message });
  }
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  setUserStatus,
  resetUserPassword,
};
