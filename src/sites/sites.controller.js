const prisma = require("../prisma");

/**
 * GET /sites
 * query:
 *  - page
 *  - limit
 *  - search
 *  - client_id (optional filter)
 */
exports.listSites = async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const client_id = String(req.query.client_id || "").trim();

    // ✅ Pagination defaults
    const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1), 100);
    const skip = (page - 1) * limit;

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ];
    }

    if (client_id) where.client_id = client_id;

    const [items, total] = await Promise.all([
      prisma.sites.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
        include: { clients: { select: { id:true, name:true } }, // ✅ اسم العلاقة الصحيح
        },
      }),
      prisma.sites.count({ where }),
    ]);

    return res.json({
      items,
      total,
      meta: { page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error("listSites error:", e);
    return res.status(500).json({ message: "Failed to load sites" });
  }
};

/**
 * POST /sites
 */
exports.createSite = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const address = req.body?.address ? String(req.body.address).trim() : null;
    const client_id = req.body?.client_id ? String(req.body.client_id) : null;

    if (!name) return res.status(400).json({ message: "name is required" });
    if (!client_id) return res.status(400).json({ message: "client_id is required" });

    const client = await prisma.clients.findUnique({ where: { id: client_id } });
    if (!client) return res.status(400).json({ message: "Invalid client_id" });

    const site = await prisma.sites.create({
      data: { name, address, client_id },
      include: {
        clients: { select: { id: true, name: true } }, // ✅ صح
      },
    });

    return res.status(201).json(site);
  } catch (e) {
    console.error("createSite error:", e);
    return res.status(500).json({ message: "Failed to create site" });
  }
};

/**
 * PUT /sites/:id
 */
exports.updateSite = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, client_id } = req.body;

    if (client_id) {
      const client = await prisma.clients.findUnique({ where: { id: client_id } });
      if (!client) return res.status(400).json({ message: "Invalid client_id" });
    }

    const site = await prisma.sites.update({
      where: { id },
      data: {
        name,
        address: address || null,
        client_id: client_id || null,
      },
      include: { clients: { select: { id:true, name:true } },
      },
    });

    res.json(site);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update site" });
  }
};

/**
 * PATCH /sites/:id/toggle
 */
exports.toggleSite = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.sites.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Site not found" });

    const updated = await prisma.sites.update({
      where: { id },
      data: { is_active: !existing.is_active },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to toggle site" });
  }
};
