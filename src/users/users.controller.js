// =======================
// src/users/users.controller.js (FINAL)
// =======================

const bcrypt = require("bcrypt");
const prisma = require("../prisma");

function normalizeEmail(email) {
  const v = String(email || "").trim();
  if (!v) return null;
  return v.toLowerCase();
}

function normalizePhone(phone) {
  const v = String(phone || "").trim();
  return v ? v : null;
}

// نرجّع نفس الحقول اللي الصفحة محتاجاها (Supervisors Page)
function safeUserSelect() {
  return {
    id: true,
    full_name: true,
    phone: true,
    email: true,
    role: true,
    is_active: true,
    created_at: true,
    // updated_at: true, // اختياري لو محتاجه
  };
}

// =======================
// GET /users
// Query: q, role, is_active, take, skip
// Returns: { items, total }
// =======================
async function listUsers(req, res) {
  try {
    const { q, role, is_active, take, skip } = req.query;
    const where = {};

    if (q) {
      const query = String(q).trim();
      where.OR = [
        { full_name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
      ];
    }

    if (role) where.role = String(role).trim();
    if (is_active !== undefined) where.is_active = String(is_active) === "true";

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
// Returns: { data }
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
// NOTE: password is REQUIRED because password_hash is required in schema.
// Returns: { data }
// =======================
async function createUser(req, res) {
  try {
    const { full_name, phone, email, role, password } = req.body ?? {};

    // password لازم يكون إجباري لأن password_hash في schema String (مش nullable)
    if (!full_name || !role || !password) {
      return res.status(400).json({ message: "full_name, role, password are required" });
    }

    const emailNorm = email ? normalizeEmail(email) : null;
    const phoneNorm = phone ? String(phone).trim() : null;

    const password_hash = await bcrypt.hash(String(password), 10);

    const created = await prisma.users.create({
      data: {
        full_name: String(full_name).trim(),
        phone: phoneNorm,
        email: emailNorm,
        role: String(role).trim(),
        is_active: true,
        password_hash,
        // ❌ لا تبعت created_at/updated_at هنا
      },
      select: safeUserSelect(),
    });

    return res.status(201).json({ data: created });
  } catch (e) {
    return res.status(500).json({ message: "Failed to create user", error: e.message });
  }
}


// =======================
// PATCH /users/:id
// body: { full_name?, phone?, email?, role? }
// Returns: { data }
// =======================
async function updateUser(req, res) {
  try {
    const id = String(req.params.id);
    const { full_name, phone, email, role } = req.body ?? {};

    const data = {};
    if (full_name !== undefined) data.full_name = String(full_name).trim();
    if (phone !== undefined) data.phone = normalizePhone(phone);
    if (email !== undefined) data.email = normalizeEmail(email);
    if (role !== undefined) data.role = String(role).trim();

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
    return res.status(500).json({ message: "Failed to update user", error: e.message });
  }
}

// =======================
// PATCH /users/:id/status
// body: { is_active: true|false }
// Returns: { data }
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
// Returns: { ok: true }
// =======================
async function resetUserPassword(req, res) {
  try {
    const id = String(req.params.id);
    const { newPassword } = req.body ?? {};

    if (!newPassword) {
      return res.status(400).json({ message: "newPassword is required" });
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
