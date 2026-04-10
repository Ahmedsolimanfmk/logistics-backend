// =======================
// src/inventory/partItems.controller.js
// =======================

const prisma = require("../maintenance/prisma");

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function requireCompanyId(companyId) {
  return (
    typeof companyId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId)
  );
}

function normalizeStatus(v) {
  const s = String(v || "").trim().toUpperCase();
  if (!s || s === "ALL") return "";
  return s;
}

async function listPartItems(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const warehouse_id = String(req.query.warehouse_id || "").trim();
    const part_id = String(req.query.part_id || "").trim();
    const status = normalizeStatus(req.query.status);

    const companyId = req.companyId;

    if (!requireCompanyId(companyId)) {
      return res.status(400).json({ message: "Invalid company context" });
    }

    const where = {
      company_id: companyId,
    };

    if (warehouse_id) {
      if (!isUuid(warehouse_id)) {
        return res.status(400).json({ message: "Invalid warehouse_id" });
      }
      where.warehouse_id = warehouse_id;
    }

    if (part_id) {
      if (!isUuid(part_id)) {
        return res.status(400).json({ message: "Invalid part_id" });
      }
      where.part_id = part_id;
    }

    if (status) {
      where.status = status;
    }

    if (q) {
      where.OR = [
        { internal_serial: { contains: q, mode: "insensitive" } },
        { manufacturer_serial: { contains: q, mode: "insensitive" } },

        { part: { is: { part_number: { contains: q, mode: "insensitive" } } } },
        { part: { is: { name: { contains: q, mode: "insensitive" } } } },
        { part: { is: { brand: { contains: q, mode: "insensitive" } } } },

        { warehouse: { is: { name: { contains: q, mode: "insensitive" } } } },
      ];
    }

    const rows = await prisma.part_items.findMany({
      where,
      include: {
        part: true,
        warehouse: true,
      },
      orderBy: { received_at: "desc" },
      take: 200,
    });

    return res.json({ items: rows });
  } catch (err) {
    console.error("listPartItems error:", err);
    return res.status(500).json({
      message: "Failed to list part items",
      error: err?.message || "Unknown error",
    });
  }
}

module.exports = {
  listPartItems,
};