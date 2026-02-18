// =======================
// src/inventory/partItems.controller.js
// =======================

const prisma = require("../maintenance/prisma");

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v
    )
  );
}

async function listPartItems(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const warehouse_id = String(req.query.warehouse_id || "").trim();
    const part_id = String(req.query.part_id || "").trim();
    const status = String(req.query.status || "").trim();
    // IN_STOCK | RESERVED | ISSUED | INSTALLED | SCRAPPED

    const where = {};

    // ✅ Guard UUID filters (avoid Prisma runtime errors on invalid UUID)
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

    if (status) where.status = status;

    // ✅ Expanded search: serials + part master + warehouse name
    if (q) {
      where.OR = [
        // serials
        { internal_serial: { contains: q, mode: "insensitive" } },
        { manufacturer_serial: { contains: q, mode: "insensitive" } },

        // part master
        { parts: { part_number: { contains: q, mode: "insensitive" } } },
        { parts: { name: { contains: q, mode: "insensitive" } } },
        { parts: { brand: { contains: q, mode: "insensitive" } } },

        // warehouse
        { warehouses: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const rows = await prisma.part_items.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: {
        parts: true,
        warehouses: true,
      },
      orderBy: { received_at: "desc" },
      take: 200, // ✅ safety limit
    });

    res.json({ items: rows });
  } catch (err) {
    console.error("listPartItems error:", err);
    res.status(500).json({ message: "Failed to list part items" });
  }
}

module.exports = {
  listPartItems,
};
