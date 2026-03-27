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

function toDecimalOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

async function ensureClientExists(clientId) {
  if (!clientId) throw buildError("client_id is required");
  if (!isUuid(clientId)) throw buildError("Invalid client_id");

  const client = await prisma.clients.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, is_active: true },
  });

  if (!client) throw buildError("Client not found", 404);
  return client;
}

function buildListWhere(query = {}) {
  const where = {};

  const search = s(query.search);
  const client_id = s(query.client_id);
  const city = s(query.city);
  const site_type = s(query.site_type);
  const zone = s(query.zone);
  const is_active = toBool(query.is_active, null);

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { address: { contains: search, mode: "insensitive" } },
      { city: { contains: search, mode: "insensitive" } },
      { site_type: { contains: search, mode: "insensitive" } },
      { zone: { contains: search, mode: "insensitive" } },
      {
        clients: {
          name: { contains: search, mode: "insensitive" },
        },
      },
    ];
  }

  if (client_id) {
    if (!isUuid(client_id)) throw buildError("Invalid client_id");
    where.client_id = client_id;
  }

  if (city) {
    where.city = { contains: city, mode: "insensitive" };
  }

  if (site_type) {
    where.site_type = { contains: site_type, mode: "insensitive" };
  }

  if (zone) {
    where.zone = { contains: zone, mode: "insensitive" };
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
    const page = Math.max(parseInt(String(req.query.page || "1"), 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit || "50"), 10) || 50, 1),
      100
    );
    const skip = (page - 1) * limit;

    const where = buildListWhere(req.query);

    const [items, total] = await Promise.all([
      prisma.sites.findMany({
        where,
        orderBy: [{ created_at: "desc" }],
        skip,
        take: limit,
        include: {
          clients: { select: { id: true, name: true } },
          site_trips: {
            select: {
              id: true,
              trip_code: true,
              status: true,
              financial_status: true,
              created_at: true,
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
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid site id",
      });
    }

    const site = await prisma.sites.findUnique({
      where: { id },
      include: {
        clients: { select: { id: true, name: true } },
        site_trips: {
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            trip_code: true,
            status: true,
            financial_status: true,
            created_at: true,
            scheduled_at: true,
            origin: true,
            destination: true,
            agreed_revenue: true,
            revenue_currency: true,
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
// =======================
exports.createSite = async (req, res) => {
  try {
    const name = s(req.body?.name);
    const address = s(req.body?.address);
    const client_id = s(req.body?.client_id);
    const site_type = s(req.body?.site_type);
    const city = s(req.body?.city);
    const zone = s(req.body?.zone);
    const latitude = toDecimalOrNull(req.body?.latitude);
    const longitude = toDecimalOrNull(req.body?.longitude);
    const is_active =
      typeof req.body?.is_active === "boolean" ? req.body.is_active : true;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "name is required",
      });
    }

    await ensureClientExists(client_id);

    if (req.body?.latitude !== undefined && latitude === null) {
      return res.status(400).json({
        success: false,
        message: "latitude must be a valid number",
      });
    }

    if (req.body?.longitude !== undefined && longitude === null) {
      return res.status(400).json({
        success: false,
        message: "longitude must be a valid number",
      });
    }

    const site = await prisma.sites.create({
      data: {
        name,
        address,
        client_id,
        site_type,
        city,
        zone,
        latitude,
        longitude,
        is_active,
      },
      include: {
        clients: { select: { id: true, name: true } },
      },
    });

    return res.status(201).json({
      success: true,
      message: "Site created successfully",
      data: site,
    });
  } catch (e) {
    console.error("createSite error:", e);
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
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid site id",
      });
    }

    const existing = await prisma.sites.findUnique({
      where: { id },
      select: {
        id: true,
        client_id: true,
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

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

    if (req.body.address !== undefined) data.address = s(req.body.address);
    if (req.body.site_type !== undefined) data.site_type = s(req.body.site_type);
    if (req.body.city !== undefined) data.city = s(req.body.city);
    if (req.body.zone !== undefined) data.zone = s(req.body.zone);
    if (typeof req.body.is_active === "boolean") data.is_active = req.body.is_active;

    if (req.body.client_id !== undefined) {
      const nextClientId = s(req.body.client_id);
      await ensureClientExists(nextClientId);
      data.client_id = nextClientId;
    }

    if (req.body.latitude !== undefined) {
      const latitude = toDecimalOrNull(req.body.latitude);
      if (latitude === null && req.body.latitude !== null && req.body.latitude !== "") {
        return res.status(400).json({
          success: false,
          message: "latitude must be a valid number",
        });
      }
      data.latitude = latitude;
    }

    if (req.body.longitude !== undefined) {
      const longitude = toDecimalOrNull(req.body.longitude);
      if (longitude === null && req.body.longitude !== null && req.body.longitude !== "") {
        return res.status(400).json({
          success: false,
          message: "longitude must be a valid number",
        });
      }
      data.longitude = longitude;
    }

    const site = await prisma.sites.update({
      where: { id },
      data,
      include: {
        clients: { select: { id: true, name: true } },
      },
    });

    return res.json({
      success: true,
      message: "Site updated successfully",
      data: site,
    });
  } catch (err) {
    console.error("updateSite error:", err);
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
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid site id",
      });
    }

    const existing = await prisma.sites.findUnique({
      where: { id },
      select: { id: true, is_active: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Site not found",
      });
    }

    const updated = await prisma.sites.update({
      where: { id },
      data: { is_active: !existing.is_active },
      include: {
        clients: { select: { id: true, name: true } },
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