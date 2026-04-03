const prisma = require("../prisma");

// =======================
// Helpers
// =======================
function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function s(v) {
  if (v === undefined || v === null) return null;
  const x = String(v).trim();
  return x ? x : null;
}

function toBool(v, fallback = null) {
  if (typeof v === "boolean") return v;
  if (v === undefined || v === null || v === "") return fallback;

  const x = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(x)) return true;
  if (["false", "0", "no", "n"].includes(x)) return false;
  return fallback;
}

function buildError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizeCode(value) {
  const code = s(value);
  return code ? code.toUpperCase() : null;
}

async function ensureClientExists(companyId, clientId) {
  if (!clientId) throw buildError("client_id is required");
  if (!isUuid(clientId)) throw buildError("Invalid client_id");

  const client = await prisma.clients.findFirst({
    where: {
      id: clientId,
      company_id: companyId,
    },
    select: {
      id: true,
      name: true,
      code: true,
      is_active: true,
    },
  });

  if (!client) throw buildError("Client not found", 404);

  return client;
}

async function getSiteOrThrow(companyId, siteId) {
  if (!isUuid(siteId)) {
    throw buildError("Invalid site id");
  }

  const site = await prisma.sites.findFirst({
    where: {
      id: siteId,
      company_id: companyId,
    },
    select: {
      id: true,
      company_id: true,
      client_id: true,
      code: true,
      name: true,
      address: true,
      is_active: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!site) {
    throw buildError("Site not found", 404);
  }

  return site;
}

function buildListWhere(companyId, query = {}) {
  const where = {
    company_id: companyId,
  };

  const search = s(query.search || query.q);
  const client_id = s(query.client_id);
  const code = s(query.code);
  const is_active = toBool(query.is_active, null);

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { address: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      {
        client: {
          name: { contains: search, mode: "insensitive" },
        },
      },
    ];
  }

  if (client_id) {
    if (!isUuid(client_id)) throw buildError("Invalid client_id");
    where.client_id = client_id;
  }

  if (code) {
    where.code = { contains: code, mode: "insensitive" };
  }

  if (typeof is_active === "boolean") {
    where.is_active = is_active;
  }

  return where;
}

// =======================
// GET /sites
// =======================
exports.listSites = async (req, res) => {
  try {
    const companyId = req.companyId;

    const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1),
      100
    );
    const skip = (page - 1) * limit;

    const where = buildListWhere(companyId, req.query);

    const [items, total] = await Promise.all([
      prisma.sites.findMany({
        where,
        orderBy: [{ created_at: "desc" }, { name: "asc" }],
        skip,
        take: limit,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              code: true,
              is_active: true,
            },
          },
        },
      }),
      prisma.sites.count({ where }),
    ]);

    return res.json({
      success: true,
      items,
      total,
      meta: {
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error("listSites error:", e);
    return res.status(e.statusCode || 500).json({
      success: false,
      message: e?.message || "Failed to load sites",
    });
  }
};

// =======================
// GET /sites/:id
// =======================
exports.getSiteById = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid site id",
      });
    }

    const site = await prisma.sites.findFirst({
      where: {
        id,
        company_id: companyId,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            code: true,
            is_active: true,
          },
        },
      },
    });

    if (!site) {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    return res.json({
      success: true,
      data: site,
    });
  } catch (e) {
    console.error("getSiteById error:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to load site",
    });
  }
};

// =======================
// POST /sites
// body: { client_id, code?, name, address?, is_active? }
// =======================
exports.createSite = async (req, res) => {
  try {
    const companyId = req.companyId;

    const name = s(req.body?.name);
    const address = s(req.body?.address);
    const code = normalizeCode(req.body?.code);
    const client_id = s(req.body?.client_id);
    const is_active =
      typeof req.body?.is_active === "boolean" ? req.body.is_active : true;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "name is required",
      });
    }

    await ensureClientExists(companyId, client_id);

    const site = await prisma.sites.create({
      data: {
        company_id: companyId,
        client_id,
        code,
        name,
        address,
        is_active,
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            code: true,
            is_active: true,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: "Site created successfully",
      data: site,
    });
  } catch (e) {
    console.error("createSite error:", e);

    if (e?.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "A site with the same code or name already exists for this company/client",
      });
    }

    return res.status(e.statusCode || 500).json({
      success: false,
      message: e?.message || "Failed to create site",
    });
  }
};

// =======================
// PUT /sites/:id
// =======================
exports.updateSite = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    const existing = await getSiteOrThrow(companyId, id);

    const data = {};

    if (req.body.name !== undefined) {
      const name = s(req.body.name);
      if (!name) {
        return res.status(400).json({
          success: false,
          message: "name cannot be empty",
        });
      }
      data.name = name;
    }

    if (req.body.code !== undefined) {
      data.code = normalizeCode(req.body.code);
    }

    if (req.body.address !== undefined) {
      data.address = s(req.body.address);
    }

    if (typeof req.body.is_active === "boolean") {
      data.is_active = req.body.is_active;
    }

    if (req.body.client_id !== undefined) {
      const nextClientId = s(req.body.client_id);
      await ensureClientExists(companyId, nextClientId);
      data.client_id = nextClientId;
    }

    const site = await prisma.sites.update({
      where: { id: existing.id },
      data,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            code: true,
            is_active: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      message: "Site updated successfully",
      data: site,
    });
  } catch (err) {
    console.error("updateSite error:", err);

    if (err?.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "A site with the same code or name already exists for this company/client",
      });
    }

    return res.status(err.statusCode || 500).json({
      success: false,
      message: err?.message || "Failed to update site",
    });
  }
};

// =======================
// PATCH /sites/:id/toggle
// =======================
exports.toggleSite = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    const existing = await prisma.sites.findFirst({
      where: {
        id,
        company_id: companyId,
      },
      select: {
        id: true,
        is_active: true,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    const updated = await prisma.sites.update({
      where: { id: existing.id },
      data: { is_active: !existing.is_active },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            code: true,
            is_active: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      message: "Site status updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("toggleSite error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle site",
    });
  }
};