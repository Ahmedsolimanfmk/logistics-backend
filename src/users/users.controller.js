// =======================
// src/users/users.controller.js
// tenant-safe version
// scoped through company_users
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

function parseBooleanQuery(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
    updated_at: true,
  };
}

function safeMembershipSelect() {
  return {
    company_id: true,
    user_id: true,
    is_active: true,
    status: true,
    joined_at: true,
    users: {
      select: safeUserSelect(),
    },
  };
}

// ---------- Prisma error helper ----------
function handlePrismaUnique(error, res) {
  if (error?.code === "P2002") {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.join(",")
      : String(error.meta?.target || "");

    return res.status(409).json({
      message: "Duplicate value",
      field: target || undefined,
    });
  }

  return null;
}

function buildMembershipWhere(companyId, query) {
  const { q, role, is_active } = query || {};

  const where = {
    company_id: companyId,
    status: "ACTIVE",
    users: {},
  };

  const userFilters = {};

  if (q) {
    const search = String(q).trim();
    if (search) {
      userFilters.OR = [
        { full_name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }
  }

  if (role) {
    const rr = normalizeRole(role);
    if (rr) {
      userFilters.role = rr;
    }
  }

  const isActiveParsed = parseBooleanQuery(is_active);
  if (typeof isActiveParsed === "boolean") {
    userFilters.is_active = isActiveParsed;
  }

  where.users = userFilters;

  return where;
}

async function getMembershipOrThrow(companyId, userId) {
  const membership = await prisma.company_users.findFirst({
    where: {
      company_id: companyId,
      user_id: userId,
      status: "ACTIVE",
    },
    select: safeMembershipSelect(),
  });

  if (!membership?.users) {
    const err = new Error("User not found");
    err.statusCode = 404;
    throw err;
  }

  return membership;
}

async function ensureEmailNotUsedByAnotherUser(email, excludeUserId) {
  if (!email) return;

  const existing = await prisma.users.findFirst({
    where: {
      email,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    const err = new Error("Email already exists");
    err.statusCode = 409;
    throw err;
  }
}

async function ensurePhoneNotUsedByAnotherUser(phone, excludeUserId) {
  if (!phone) return;

  const existing = await prisma.users.findFirst({
    where: {
      phone,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    const err = new Error("Phone already exists");
    err.statusCode = 409;
    throw err;
  }
}

async function ensureNoExistingMembership(companyId, userId) {
  const existing = await prisma.company_users.findFirst({
    where: {
      company_id: companyId,
      user_id: userId,
    },
    select: {
      user_id: true,
      status: true,
      is_active: true,
    },
  });

  if (existing) {
    const err = new Error("User is already linked to this company");
    err.statusCode = 409;
    throw err;
  }
}

function mapMembershipResponse(membership) {
  return {
    ...membership.users,
    company_membership: {
      company_id: membership.company_id,
      user_id: membership.user_id,
      is_active: membership.is_active,
      status: membership.status,
      joined_at: membership.joined_at,
    },
  };
}

// =======================
// GET /users
// Query: q, role, is_active, take, skip
// =======================
async function listUsers(req, res) {
  try {
    const { take, skip } = req.query || {};
    const where = buildMembershipWhere(req.companyId, req.query || {});

    const takeN = Math.min(parsePositiveInt(take, 50), 200);
    const skipN = Math.max(Number(skip) || 0, 0);

    const [itemsRaw, total] = await Promise.all([
      prisma.company_users.findMany({
        where,
        select: safeMembershipSelect(),
        orderBy: [
          { is_active: "desc" },
          { joined_at: "desc" },
        ],
        take: takeN,
        skip: skipN,
      }),
      prisma.company_users.count({ where }),
    ]);

    const items = itemsRaw.map(mapMembershipResponse);

    return res.json({ items, total });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to list users",
      error: error.message,
    });
  }
}

// =======================
// GET /users/:id
// =======================
async function getUserById(req, res) {
  try {
    const id = String(req.params.id);

    const membership = await getMembershipOrThrow(req.companyId, id);

    return res.json({
      data: mapMembershipResponse(membership),
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: error.message || "Failed to get user",
      ...(status >= 500 ? { error: error.message } : {}),
    });
  }
}

// =======================
// POST /users
// body: { full_name, phone?, email?, role, password }
// creates user + company membership
// =======================
async function createUser(req, res) {
  try {
    const { full_name, phone, email, role, password } = req.body ?? {};

    if (!full_name || !role || !password) {
      return res.status(400).json({
        message: "full_name, role, password are required",
      });
    }

    const roleNorm = normalizeRole(role);
    if (!roleNorm) {
      return res.status(400).json({ message: "role is invalid" });
    }

    const emailNorm = email !== undefined ? normalizeEmail(email) : null;
    const phoneNorm = phone !== undefined ? normalizePhone(phone) : null;

    if (String(password).length < 6) {
      return res.status(400).json({
        message: "password must be at least 6 characters",
      });
    }

    await ensureEmailNotUsedByAnotherUser(emailNorm, null);
    await ensurePhoneNotUsedByAnotherUser(phoneNorm, null);

    const password_hash = await bcrypt.hash(String(password), 10);

    const result = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.users.create({
        data: {
          full_name: String(full_name).trim(),
          phone: phoneNorm,
          email: emailNorm,
          role: roleNorm,
          is_active: true,
          password_hash,
        },
        select: safeUserSelect(),
      });

      const membership = await tx.company_users.create({
        data: {
          company_id: req.companyId,
          user_id: createdUser.id,
          is_active: true,
          status: "ACTIVE",
          joined_at: new Date(),
        },
        select: {
          company_id: true,
          user_id: true,
          is_active: true,
          status: true,
          joined_at: true,
        },
      });

      return {
        ...createdUser,
        company_membership: membership,
      };
    });

    return res.status(201).json({ data: result });
  } catch (error) {
    const handled = handlePrismaUnique(error, res);
    if (handled) return;

    const status = error.statusCode || 500;
    return res.status(status).json({
      message: error.message || "Failed to create user",
      ...(status >= 500 ? { error: error.message } : {}),
    });
  }
}

// =======================
// PATCH /users/:id
// body: { full_name?, phone?, email?, role? }
// scoped by company membership existence
// =======================
async function updateUser(req, res) {
  try {
    const id = String(req.params.id);
    const { full_name, phone, email, role } = req.body ?? {};

    await getMembershipOrThrow(req.companyId, id);

    const data = {};

    if (full_name !== undefined) {
      const name = String(full_name).trim();
      if (!name) {
        return res.status(400).json({ message: "full_name cannot be empty" });
      }
      data.full_name = name;
    }

    if (phone !== undefined) {
      data.phone = normalizePhone(phone);
    }

    if (email !== undefined) {
      data.email = normalizeEmail(email);
    }

    if (role !== undefined) {
      data.role = normalizeRole(role);
      if (!data.role) {
        return res.status(400).json({ message: "role is invalid" });
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    await ensureEmailNotUsedByAnotherUser(data.email, id);
    await ensurePhoneNotUsedByAnotherUser(data.phone, id);

    const updated = await prisma.users.update({
      where: { id },
      data,
      select: safeUserSelect(),
    });

    const membership = await getMembershipOrThrow(req.companyId, id);

    return res.json({
      data: {
        ...updated,
        company_membership: {
          company_id: membership.company_id,
          user_id: membership.user_id,
          is_active: membership.is_active,
          status: membership.status,
          joined_at: membership.joined_at,
        },
      },
    });
  } catch (error) {
    const handled = handlePrismaUnique(error, res);
    if (handled) return;

    const status = error.statusCode || 500;
    return res.status(status).json({
      message: error.message || "Failed to update user",
      ...(status >= 500 ? { error: error.message } : {}),
    });
  }
}

// =======================
// PATCH /users/:id/status
// body: { is_active: true|false }
// updates membership activity inside this company
// optionally mirrors users.is_active
// =======================
async function setUserStatus(req, res) {
  try {
    const id = String(req.params.id);
    const { is_active } = req.body ?? {};

    if (typeof is_active !== "boolean") {
      return res.status(400).json({ message: "is_active must be boolean" });
    }

    await getMembershipOrThrow(req.companyId, id);

    const result = await prisma.$transaction(async (tx) => {
      await tx.company_users.updateMany({
        where: {
          company_id: req.companyId,
          user_id: id,
        },
        data: {
          is_active,
          status: is_active ? "ACTIVE" : "INACTIVE",
        },
      });

      const updatedUser = await tx.users.update({
        where: { id },
        data: { is_active },
        select: safeUserSelect(),
      });

      const membership = await tx.company_users.findFirst({
        where: {
          company_id: req.companyId,
          user_id: id,
        },
        select: {
          company_id: true,
          user_id: true,
          is_active: true,
          status: true,
          joined_at: true,
        },
      });

      return {
        ...updatedUser,
        company_membership: membership,
      };
    });

    return res.json({ data: result });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: error.message || "Failed to change status",
      ...(status >= 500 ? { error: error.message } : {}),
    });
  }
}

// =======================
// POST /users/:id/reset-password
// body: { newPassword }
// only if user belongs to this company
// =======================
async function resetUserPassword(req, res) {
  try {
    const id = String(req.params.id);
    const { newPassword } = req.body ?? {};

    if (!newPassword) {
      return res.status(400).json({ message: "newPassword is required" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        message: "newPassword must be at least 6 characters",
      });
    }

    await getMembershipOrThrow(req.companyId, id);

    const hash = await bcrypt.hash(String(newPassword), 10);

    await prisma.users.update({
      where: { id },
      data: { password_hash: hash },
    });

    return res.json({ ok: true });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: error.message || "Failed to reset password",
      ...(status >= 500 ? { error: error.message } : {}),
    });
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