// =======================
// src/drivers/drivers.controller.js
// =======================

const prisma = require("../prisma");

function parseBool(v) {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return undefined;
}

function pickPagination(req) {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const pageSizeRaw = parseInt(req.query.pageSize || "10", 10);
  const pageSize = Math.min(100, Math.max(5, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

function prismaErrorToHttp(e) {
  const code = e?.code;
  if (code === "P2002") {
    return { status: 400, message: "Duplicate value (phone or license_no)", details: e?.meta };
  }
  return null;
}

// ✅ NEW: GET /drivers/active
// query: q (optional)  => used for dropdown search
async function getActiveDrivers(req, res) {
  try {
    const q = String(req.query.q || "").trim();

    const where = {
      is_active: true,
      ...(q
        ? {
            OR: [
              { full_name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { license_no: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const drivers = await prisma.drivers.findMany({
      where,
      orderBy: [{ full_name: "asc" }],
      select: {
        id: true,
        full_name: true,
        phone: true,
        license_no: true,
      },
    });

    return res.json(drivers);
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch active drivers",
      error: e.message,
    });
  }
}

// GET /drivers
// query: q, is_active, page, pageSize
async function getDrivers(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const isActive = parseBool(req.query.is_active);
    const { page, pageSize, skip } = pickPagination(req);

    const where = {
      ...(typeof isActive === "boolean" ? { is_active: isActive } : {}),
      ...(q
        ? {
            OR: [
              { full_name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { license_no: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.drivers.findMany({
        where,
        orderBy: [{ is_active: "desc" }, { full_name: "asc" }, { created_at: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.drivers.count({ where }),
    ]);

    return res.json({ page, pageSize, total, items });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch drivers",
      error: e.message,
    });
  }
}

// GET /drivers/:id
async function getDriverById(req, res) {
  try {
    const { id } = req.params;

    const driver = await prisma.drivers.findUnique({
      where: { id },
    });

    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    return res.json(driver);
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch driver",
      error: e.message,
    });
  }
}

// POST /drivers
async function createDriver(req, res) {
  try {
    const { full_name, phone, license_no } = req.body || {};
    const name = String(full_name || "").trim();

    if (!name) {
      return res.status(400).json({ message: "full_name is required" });
    }

    const driver = await prisma.drivers.create({
      data: {
        full_name: name,
        phone: phone ? String(phone).trim() : null,
        license_no: license_no ? String(license_no).trim() : null,
      },
    });

    return res.status(201).json(driver);
  } catch (e) {
    const mapped = prismaErrorToHttp(e);
    if (mapped) return res.status(mapped.status).json({ message: mapped.message, details: mapped.details });

    return res.status(500).json({
      message: "Failed to create driver",
      error: e.message,
    });
  }
}

// PATCH /drivers/:id
async function updateDriver(req, res) {
  try {
    const { id } = req.params;
    const { full_name, phone, license_no } = req.body || {};

    const exists = await prisma.drivers.findUnique({ where: { id } });
    if (!exists) {
      return res.status(404).json({ message: "Driver not found" });
    }

    const data = {};

    if (full_name !== undefined) {
      const name = String(full_name || "").trim();
      if (!name) return res.status(400).json({ message: "full_name cannot be empty" });
      data.full_name = name;
    }

    if (phone !== undefined) data.phone = phone ? String(phone).trim() : null;
    if (license_no !== undefined) data.license_no = license_no ? String(license_no).trim() : null;

    const updated = await prisma.drivers.update({
      where: { id },
      data,
    });

    return res.json(updated);
  } catch (e) {
    const mapped = prismaErrorToHttp(e);
    if (mapped) return res.status(mapped.status).json({ message: mapped.message, details: mapped.details });

    return res.status(500).json({
      message: "Failed to update driver",
      error: e.message,
    });
  }
}

// PATCH /drivers/:id/status
async function setDriverStatus(req, res) {
  try {
    const { id } = req.params;

    const isActive = parseBool(req.body?.is_active);

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "is_active must be boolean" });
    }

    const exists = await prisma.drivers.findUnique({ where: { id } });
    if (!exists) {
      return res.status(404).json({ message: "Driver not found" });
    }

    const updated = await prisma.drivers.update({
      where: { id },
      data: { is_active: isActive },
    });

    return res.json(updated);
  } catch (e) {
    return res.status(500).json({
      message: "Failed to update driver status",
      error: e.message,
    });
  }
}

module.exports = {
  getActiveDrivers, // ✅ NEW
  getDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  setDriverStatus,
};
