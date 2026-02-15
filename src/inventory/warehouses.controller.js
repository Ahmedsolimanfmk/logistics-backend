// =======================
// src/inventory/warehouses.controller.js
// =======================

const prisma = require("../maintenance/prisma");

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

async function listWarehouses(req, res) {
  try {
    const onlyActive = String(req.query.active || "").trim() === "1";

    const rows = await prisma.warehouses.findMany({
      where: onlyActive ? { is_active: true } : undefined,
      orderBy: [{ name: "asc" }],
    });

    res.json({ items: rows });
  } catch (err) {
    console.error("listWarehouses error:", err);
    res.status(500).json({ message: "Failed to list warehouses" });
  }
}

async function createWarehouse(req, res) {
  try {
    const name = String(req.body?.name || "").trim();
    const location = req.body?.location != null ? String(req.body.location).trim() : null;

    if (!name) return res.status(400).json({ message: "name is required" });

    const created = await prisma.warehouses.create({
      data: {
        name,
        location,
        is_active: true,
      },
    });

    res.status(201).json(created);
  } catch (err) {
    // unique name
    if (String(err?.code) === "P2002") {
      return res.status(409).json({ message: "Warehouse name already exists" });
    }
    console.error("createWarehouse error:", err);
    res.status(500).json({ message: "Failed to create warehouse" });
  }
}

async function updateWarehouse(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const patch = {};
    if (req.body?.name != null) patch.name = String(req.body.name).trim();
    if (req.body?.location !== undefined) patch.location = req.body.location == null ? null : String(req.body.location).trim();
    if (req.body?.is_active != null) patch.is_active = Boolean(req.body.is_active);

    if (Object.keys(patch).length === 0) return res.status(400).json({ message: "No fields to update" });

    const updated = await prisma.warehouses.update({
      where: { id },
      data: patch,
    });

    res.json(updated);
  } catch (err) {
    if (String(err?.code) === "P2025") {
      return res.status(404).json({ message: "Warehouse not found" });
    }
    if (String(err?.code) === "P2002") {
      return res.status(409).json({ message: "Warehouse name already exists" });
    }
    console.error("updateWarehouse error:", err);
    res.status(500).json({ message: "Failed to update warehouse" });
  }
}

module.exports = {
  listWarehouses,
  createWarehouse,
  updateWarehouse,
};
