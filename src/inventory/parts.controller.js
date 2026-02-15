// =======================
// src/inventory/parts.controller.js
// =======================

const prisma = require("../maintenance/prisma");

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

async function listParts(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const onlyActive = String(req.query.active || "").trim() === "1";

    const where = {};
    if (onlyActive) where.is_active = true;

    if (q) {
      where.OR = [
        { part_number: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.parts.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: [{ name: "asc" }],
    });

    res.json({ items: rows });
  } catch (err) {
    console.error("listParts error:", err);
    res.status(500).json({ message: "Failed to list parts" });
  }
}

async function createPart(req, res) {
  try {
    const part_number = String(req.body?.part_number || "").trim(); // internal code
    const name = String(req.body?.name || "").trim();
    const brand = req.body?.brand != null ? String(req.body.brand).trim() : null;
    const category = req.body?.category != null ? String(req.body.category).trim() : null;
    const unit = req.body?.unit != null ? String(req.body.unit).trim() : null;

    const min_stock =
      req.body?.min_stock == null || req.body?.min_stock === ""
        ? null
        : Number(req.body.min_stock);

    if (!part_number) return res.status(400).json({ message: "part_number is required" });
    if (!name) return res.status(400).json({ message: "name is required" });
    if (min_stock != null && (!Number.isFinite(min_stock) || min_stock < 0)) {
      return res.status(400).json({ message: "min_stock must be a non-negative number" });
    }

    const created = await prisma.parts.create({
      data: {
        part_number,
        name,
        brand,
        category,
        unit,
        min_stock: min_stock == null ? null : Math.floor(min_stock),
        is_active: true,
      },
    });

    res.status(201).json(created);
  } catch (err) {
    if (String(err?.code) === "P2002") {
      return res.status(409).json({ message: "part_number already exists" });
    }
    console.error("createPart error:", err);
    res.status(500).json({ message: "Failed to create part" });
  }
}

async function updatePart(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const patch = {};
    if (req.body?.part_number != null) patch.part_number = String(req.body.part_number).trim();
    if (req.body?.name != null) patch.name = String(req.body.name).trim();
    if (req.body?.brand !== undefined) patch.brand = req.body.brand == null ? null : String(req.body.brand).trim();
    if (req.body?.category !== undefined) patch.category = req.body.category == null ? null : String(req.body.category).trim();
    if (req.body?.unit !== undefined) patch.unit = req.body.unit == null ? null : String(req.body.unit).trim();
    if (req.body?.is_active != null) patch.is_active = Boolean(req.body.is_active);

    if (req.body?.min_stock !== undefined) {
      if (req.body.min_stock == null || req.body.min_stock === "") {
        patch.min_stock = null;
      } else {
        const v = Number(req.body.min_stock);
        if (!Number.isFinite(v) || v < 0) return res.status(400).json({ message: "min_stock must be a non-negative number" });
        patch.min_stock = Math.floor(v);
      }
    }

    if (Object.keys(patch).length === 0) return res.status(400).json({ message: "No fields to update" });

    const updated = await prisma.parts.update({
      where: { id },
      data: patch,
    });

    res.json(updated);
  } catch (err) {
    if (String(err?.code) === "P2025") {
      return res.status(404).json({ message: "Part not found" });
    }
    if (String(err?.code) === "P2002") {
      return res.status(409).json({ message: "part_number already exists" });
    }
    console.error("updatePart error:", err);
    res.status(500).json({ message: "Failed to update part" });
  }
}

module.exports = {
  listParts,
  createPart,
  updatePart,
};
