// =======================
// src/clients/clients.controller.js
// =======================

const prisma = require("../prisma");

function parseIntSafe(v, fallback) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * GET /clients
 * query:
 *  - search
 *  - page
 *  - limit
 */
exports.listClients = async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const page = Math.max(1, parseIntSafe(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, parseIntSafe(req.query.limit, 50)));
    const skip = (page - 1) * limit;

    const where = search
      ? {
          name: { contains: search, mode: "insensitive" },
        }
      : {};

    const [items, total] = await Promise.all([
      prisma.clients.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      prisma.clients.count({ where }),
    ]);

    return res.json({
      items,
      total,
      meta: {
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("listClients error:", e);
    return res.status(500).json({ message: "Failed to load clients" });
  }
};

/**
 * POST /clients
 * body: { name }
 */
exports.createClient = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "name is required" });

    const created = await prisma.clients.create({
      data: { name },
    });

    return res.status(201).json(created);
  } catch (e) {
    console.error("createClient error:", e);
    return res.status(500).json({ message: "Failed to create client" });
  }
};

/**
 * PUT /clients/:id
 * body: { name }
 */
exports.updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    const name = String(req.body?.name || "").trim();

    if (!id) return res.status(400).json({ message: "id is required" });
    if (!name) return res.status(400).json({ message: "name is required" });

    // ensure exists
    const exists = await prisma.clients.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: "Client not found" });

    const updated = await prisma.clients.update({
      where: { id },
      data: { name },
    });

    return res.json(updated);
  } catch (e) {
    console.error("updateClient error:", e);
    return res.status(500).json({ message: "Failed to update client" });
  }
};

/**
 * PATCH /clients/:id/toggle
 * flips is_active
 */
exports.toggleClient = async (req, res) => {
  try {
    const { id } = req.params;

    const exists = await prisma.clients.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: "Client not found" });

    // لو عندك اسم الحقل مختلف عدّله هنا
    const updated = await prisma.clients.update({
      where: { id },
      data: { is_active: !exists.is_active },
    });

    return res.json(updated);
  } catch (e) {
    console.error("toggleClient error:", e);
    return res.status(500).json({ message: "Failed to toggle client" });
  }
};
