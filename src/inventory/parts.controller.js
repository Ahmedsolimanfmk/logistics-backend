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

function mapPart(row) {
  return {
    id: row.id,
    part_number: row.part_number,
    name: row.name,
    brand: row.brand,
    unit: row.unit,
    min_stock: row.min_stock,
    is_active: row.is_active,

    category_id: row.category_id,

    // ✅ new structured category
    category: row.category_ref
      ? {
          id: row.category_ref.id,
          name: row.category_ref.name,
          code: row.category_ref.code,
          is_active: row.category_ref.is_active,
        }
      : null,

    // ✅ legacy (temporary)
    category_legacy: row.category,

    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listParts(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const onlyActive = String(req.query.active || "").trim() === "1";

    const companyId = req.companyId;

    const where = {
      company_id: companyId,
    };

    if (onlyActive) where.is_active = true;

    if (q) {
      where.OR = [
        { part_number: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.parts.findMany({
      where,
      include: {
        category_ref: true,
      },
      orderBy: [{ name: "asc" }],
    });

    res.json({
      items: rows.map(mapPart),
    });
  } catch (err) {
    console.error("listParts error:", err);
    res.status(500).json({ message: "Failed to list parts" });
  }
}

async function createPart(req, res) {
  try {
    const companyId = req.companyId;

    const part_number = String(req.body?.part_number || "").trim();
    const name = String(req.body?.name || "").trim();

    const brand = req.body?.brand != null ? String(req.body.brand).trim() : null;
    const unit = req.body?.unit != null ? String(req.body.unit).trim() : null;

    const category_id =
      typeof req.body?.category_id === "string" && req.body.category_id.trim()
        ? req.body.category_id.trim()
        : null;

    const min_stock =
      req.body?.min_stock == null || req.body?.min_stock === ""
        ? null
        : Number(req.body.min_stock);

    if (!part_number) return res.status(400).json({ message: "part_number is required" });
    if (!name) return res.status(400).json({ message: "name is required" });

    if (min_stock != null && (!Number.isFinite(min_stock) || min_stock < 0)) {
      return res.status(400).json({
        message: "min_stock must be a non-negative number",
      });
    }

    // ✅ validate category
    let categoryRecord = null;

    if (category_id) {
      if (!isUuid(category_id)) {
        return res.status(400).json({ message: "Invalid category_id" });
      }

      categoryRecord = await prisma.part_categories.findFirst({
        where: {
          id: category_id,
          company_id: companyId,
          is_active: true,
        },
        select: { id: true, name: true },
      });

      if (!categoryRecord) {
        return res.status(400).json({ message: "Invalid category_id" });
      }
    }

    const created = await prisma.parts.create({
      data: {
        company_id: companyId,
        part_number,
        name,
        brand,
        unit,
        min_stock: min_stock == null ? null : Math.floor(min_stock),
        is_active: true,

        category_id: categoryRecord?.id || null,

        // ✅ temporary backward compatibility
        category: categoryRecord?.name || null,
      },
      include: {
        category_ref: true,
      },
    });

    res.status(201).json(mapPart(created));
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
    const companyId = req.companyId;

    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const patch = {};

    if (req.body?.part_number != null)
      patch.part_number = String(req.body.part_number).trim();

    if (req.body?.name != null)
      patch.name = String(req.body.name).trim();

    if (req.body?.brand !== undefined)
      patch.brand = req.body.brand == null ? null : String(req.body.brand).trim();

    if (req.body?.unit !== undefined)
      patch.unit = req.body.unit == null ? null : String(req.body.unit).trim();

    if (req.body?.is_active != null)
      patch.is_active = Boolean(req.body.is_active);

    if (req.body?.min_stock !== undefined) {
      if (req.body.min_stock == null || req.body.min_stock === "") {
        patch.min_stock = null;
      } else {
        const v = Number(req.body.min_stock);
        if (!Number.isFinite(v) || v < 0) {
          return res.status(400).json({
            message: "min_stock must be a non-negative number",
          });
        }
        patch.min_stock = Math.floor(v);
      }
    }

    // ✅ category update
    if (Object.prototype.hasOwnProperty.call(req.body, "category_id")) {
      const category_id =
        typeof req.body.category_id === "string" && req.body.category_id.trim()
          ? req.body.category_id.trim()
          : null;

      if (category_id) {
        if (!isUuid(category_id)) {
          return res.status(400).json({ message: "Invalid category_id" });
        }

        const categoryRecord = await prisma.part_categories.findFirst({
          where: {
            id: category_id,
            company_id: companyId,
            is_active: true,
          },
          select: { id: true, name: true },
        });

        if (!categoryRecord) {
          return res.status(400).json({ message: "Invalid category_id" });
        }

        patch.category_id = categoryRecord.id;
        patch.category = categoryRecord.name;
      } else {
        patch.category_id = null;
        patch.category = null;
      }
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const updated = await prisma.parts.update({
      where: { id },
      data: patch,
      include: {
        category_ref: true,
      },
    });

    res.json(mapPart(updated));
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