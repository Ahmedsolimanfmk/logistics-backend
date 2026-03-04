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
// =======================
// GET /clients/:id/details?month=YYYY-MM
// returns: client + sites + ar_summary + trips_monthly_by_site
// =======================
exports.getClientDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "id is required" });

    // month "YYYY-MM"
    const month = String(req.query.month || "").trim();
    // default current month (server time)
    const now = new Date();
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthKey = month || defaultMonth;

    // parse month range [start, end)
    const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
    if (!m) return res.status(400).json({ message: "month must be YYYY-MM" });

    const y = Number(m[1]);
    const mm = Number(m[2]); // 1..12
    if (!(y >= 2000 && y <= 2100 && mm >= 1 && mm <= 12)) {
      return res.status(400).json({ message: "month must be YYYY-MM" });
    }

    const start = new Date(Date.UTC(y, mm - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, mm, 1, 0, 0, 0));

    // ✅ load client (with sites)
    const client = await prisma.clients.findUnique({
      where: { id },
      include: {
        sites: {
          orderBy: { created_at: "desc" },
        },
      },
    });

    if (!client) return res.status(404).json({ message: "Client not found" });

    // ✅ AR summary (invoiced + paid + balance)
    // - invoiced = sum(ar_invoices.total_amount) excluding CANCELLED
    // - paid = sum(ar_payments.amount) excluding CANCELLED
    const [invAgg, payAgg] = await Promise.all([
      prisma.ar_invoices.aggregate({
        where: {
          client_id: id,
          status: { not: "CANCELLED" },
        },
        _sum: { total_amount: true },
      }),
      prisma.ar_payments.aggregate({
        where: {
          client_id: id,
          status: { not: "CANCELLED" },
        },
        _sum: { amount: true },
      }),
    ]);

    const totalInvoiced = Number(invAgg?._sum?.total_amount || 0);
    const totalPaid = Number(payAgg?._sum?.amount || 0);
    const balance = totalInvoiced - totalPaid;

    // ✅ trips monthly by site (count trips in created_at within month)
    // Prisma groupBy is ok here
    const grouped = await prisma.trips.groupBy({
      by: ["site_id"],
      where: {
        client_id: id,
        created_at: {
          gte: start,
          lt: end,
        },
      },
      _count: { _all: true },
    });

    const siteIds = grouped.map((g) => g.site_id);
    const sites = siteIds.length
      ? await prisma.sites.findMany({
          where: { id: { in: siteIds } },
          select: { id: true, name: true },
        })
      : [];

    const siteNameMap = new Map(sites.map((s) => [s.id, s.name]));

    const trips_monthly_by_site = grouped.map((g) => ({
      site_id: g.site_id,
      site_name: siteNameMap.get(g.site_id) || "—",
      month: monthKey,
      trips_count: g._count?._all || 0,
    }));

    return res.json({
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        hq_address: client.hq_address,
        contact_name: client.contact_name,
        contact_phone: client.contact_phone,
        contact_email: client.contact_email,
        tax_no: client.tax_no,
        notes: client.notes,
        is_active: client.is_active,
        created_at: client.created_at,
        updated_at: client.updated_at,
      },
      sites: (client.sites || []).map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        is_active: s.is_active,
        created_at: s.created_at,
      })),
      ar_summary: {
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
        balance,
      },
      trips_monthly_by_site,
    });
  } catch (e) {
    console.error("getClientDetails error:", e);
    return res.status(500).json({ message: "Failed to load client details" });
  }
};
// =======================
// GET /clients/:id/dashboard?month=YYYY-MM
// =======================
exports.getClientDashboard = async (req, res) => {
  try {
    const { id } = req.params;
    const month = String(req.query.month || "").trim(); // "2026-03"

    if (!id) return res.status(400).json({ message: "id is required" });

    // month range
    let start = null;
    let end = null;

    if (month) {
      const m = month.match(/^(\d{4})-(\d{2})$/);
      if (!m) return res.status(400).json({ message: "month must be YYYY-MM" });

      const y = Number(m[1]);
      const mm = Number(m[2]); // 1..12
      start = new Date(Date.UTC(y, mm - 1, 1, 0, 0, 0));
      end = new Date(Date.UTC(y, mm, 1, 0, 0, 0)); // next month
    } else {
      // default current month (server time)
      const now = new Date();
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
      end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
    }

    const client = await prisma.clients.findUnique({
      where: { id },
      include: {
        sites: { orderBy: { created_at: "desc" } },
      },
    });

    if (!client) return res.status(404).json({ message: "Client not found" });

    // financial summary
    const [invAgg, payAgg] = await Promise.all([
      prisma.ar_invoices.aggregate({
        where: { client_id: id, status: { not: "CANCELLED" } },
        _sum: { total_amount: true },
      }),
      prisma.ar_payments.aggregate({
        where: { client_id: id, status: { not: "CANCELLED" } },
        _sum: { amount: true },
      }),
    ]);

    const totalInvoiced = Number(invAgg?._sum?.total_amount || 0);
    const totalPaid = Number(payAgg?._sum?.amount || 0);
    const balance = totalInvoiced - totalPaid;

    // trips count per site for month
    const tripGroups = await prisma.trips.groupBy({
      by: ["site_id"],
      where: {
        client_id: id,
        created_at: { gte: start, lt: end }, // ✅ monthly by created_at
      },
      _count: { _all: true },
    });

    const tripCountBySite = new Map(tripGroups.map((g) => [g.site_id, g._count._all]));

    const sites = (client.sites || []).map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      is_active: s.is_active,
      trips_this_month: tripCountBySite.get(s.id) || 0,
    }));

    return res.json({
      client,
      month: month || `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`,
      financial: {
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
        balance,
      },
      sites,
    });
  } catch (e) {
    console.error("getClientDashboard error:", e);
    return res.status(500).json({ message: "Failed to load client dashboard" });
  }
};
