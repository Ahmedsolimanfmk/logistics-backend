// =======================
// src/inventory/stock.controller.js
// =======================

const prisma = require("../maintenance/prisma");

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

async function listStock(req, res) {
  try {
    const companyId = req.companyId;

    if (!isUuid(companyId)) {
      return res.status(400).json({ message: "Invalid company context" });
    }

    const warehouse_id = String(req.query.warehouse_id || "").trim();
    const part_id = String(req.query.part_id || "").trim();
    const q = String(req.query.q || "").trim();

    if (warehouse_id && !isUuid(warehouse_id)) {
      return res.status(400).json({ message: "Invalid warehouse_id" });
    }

    if (part_id && !isUuid(part_id)) {
      return res.status(400).json({ message: "Invalid part_id" });
    }

    const where = {
      company_id: companyId,
      ...(warehouse_id ? { warehouse_id } : {}),
      ...(part_id ? { part_id } : {}),
      ...(q
        ? {
            part: {
              is: {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { part_number: { contains: q, mode: "insensitive" } },
                  { brand: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          }
        : {}),
    };

    const rows = await prisma.warehouse_parts.findMany({
      where,
      orderBy: [{ updated_at: "desc" }],
      include: {
        warehouse: {
          select: {
            id: true,
            name: true,
            location: true,
            is_active: true,
          },
        },
        part: {
          select: {
            id: true,
            name: true,
            part_number: true,
            brand: true,
            unit: true,
            min_stock: true,
            is_active: true,
          },
        },
      },
    });

    return res.json({
      items: rows.map((r) => ({
        id: r.id,
        company_id: r.company_id,

        warehouse_id: r.warehouse_id,
        warehouse_name: r.warehouse?.name || null,
        warehouse_location: r.warehouse?.location || null,

        part_id: r.part_id,
        part_name: r.part?.name || null,
        part_number: r.part?.part_number || null,
        brand: r.part?.brand || null,
        unit: r.part?.unit || null,
        min_stock: r.part?.min_stock ?? null,

        qty_on_hand: Number(r.qty_on_hand || 0),
        updated_at: r.updated_at,
      })),
    });
  } catch (err) {
    console.error("listStock error:", err);
    return res.status(500).json({
      message: "Failed to list stock",
      error: err?.message || String(err),
      code: err?.code,
      meta: err?.meta,
    });
  }
}

module.exports = {
  listStock,
};