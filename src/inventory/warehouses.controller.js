// =======================
// src/inventory/warehouses.controller.js
// tenant-safe version
// =======================

const prisma = require("../maintenance/prisma");

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function requireCompanyId(req, res) {
  const companyId = req.companyId;

  if (!isUuid(companyId)) {
    res.status(400).json({ message: "Invalid company context" });
    return null;
  }

  return companyId;
}

async function listWarehouses(req, res) {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const onlyActive = String(req.query.active || "").trim() === "1";
    const q = String(req.query.q || "").trim();

    const where = {
      company_id: companyId,
      ...(onlyActive ? { is_active: true } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { location: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const rows = await prisma.warehouses.findMany({
      where,
      orderBy: [{ name: "asc" }],
    });

    return res.json({ items: rows });
  } catch (err) {
    console.error("listWarehouses error:", err);
    return res.status(500).json({
      message: "Failed to list warehouses",
      error: err?.message || String(err),
      code: err?.code,
      meta: err?.meta,
    });
  }
}

async function createWarehouse(req, res) {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const name = String(req.body?.name || "").trim();
    const location =
      req.body?.location != null ? String(req.body.location).trim() : null;

    if (!name) {
      return res.status(400).json({ message: "name is required" });
    }

    const existing = await prisma.warehouses.findFirst({
      where: {
        company_id: companyId,
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (existing) {
      return res.status(409).json({
        message: "Warehouse name already exists in this company",
      });
    }

    const created = await prisma.warehouses.create({
      data: {
        company_id: companyId,
        name,
        location,
        is_active: true,
      },
    });

    return res.status(201).json(created);
  } catch (err) {
    if (String(err?.code) === "P2002") {
      return res.status(409).json({
        message: "Warehouse name already exists",
      });
    }

    console.error("createWarehouse error:", err);
    return res.status(500).json({
      message: "Failed to create warehouse",
      error: err?.message || String(err),
      code: err?.code,
      meta: err?.meta,
    });
  }
}

async function updateWarehouse(req, res) {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    const id = String(req.params.id || "").trim();

    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const existing = await prisma.warehouses.findFirst({
      where: {
        id,
        company_id: companyId,
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Warehouse not found" });
    }

    const patch = {};

    if (req.body?.name != null) {
      const name = String(req.body.name).trim();

      if (!name) {
        return res.status(400).json({ message: "name cannot be empty" });
      }

      const duplicate = await prisma.warehouses.findFirst({
        where: {
          company_id: companyId,
          id: { not: id },
          name: {
            equals: name,
            mode: "insensitive",
          },
        },
        select: { id: true },
      });

      if (duplicate) {
        return res.status(409).json({
          message: "Warehouse name already exists in this company",
        });
      }

      patch.name = name;
    }

    if (req.body?.location !== undefined) {
      patch.location =
        req.body.location == null ? null : String(req.body.location).trim();
    }

    if (req.body?.is_active != null) {
      patch.is_active = Boolean(req.body.is_active);
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const updated = await prisma.warehouses.update({
      where: { id },
      data: patch,
    });

    return res.json(updated);
  } catch (err) {
    if (String(err?.code) === "P2025") {
      return res.status(404).json({ message: "Warehouse not found" });
    }

    if (String(err?.code) === "P2002") {
      return res.status(409).json({
        message: "Warehouse name already exists",
      });
    }

    console.error("updateWarehouse error:", err);
    return res.status(500).json({
      message: "Failed to update warehouse",
      error: err?.message || String(err),
      code: err?.code,
      meta: err?.meta,
    });
  }
}

module.exports = {
  listWarehouses,
  createWarehouse,
  updateWarehouse,
};