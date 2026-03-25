const prisma = require("../prisma");

// =======================
// Helpers
// =======================
function parseIntSafe(v, fallback) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function s(v) {
  const x = v == null ? "" : String(v);
  const t = x.trim();
  return t ? t : null;
}

function toBool(v, fallback = null) {
  if (typeof v === "boolean") return v;
  if (v === undefined || v === null || v === "") return fallback;

  const x = String(v).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(x)) return true;
  if (["false", "0", "no", "n"].includes(x)) return false;
  return fallback;
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function buildError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseMonthRange(month) {
  const monthKey = String(month || "").trim();
  const now = new Date();

  const fallbackMonth = `${now.getUTCFullYear()}-${String(
    now.getUTCMonth() + 1
  ).padStart(2, "0")}`;

  const finalMonth = monthKey || fallbackMonth;
  const m = /^(\d{4})-(\d{2})$/.exec(finalMonth);

  if (!m) return null;

  const y = Number(m[1]);
  const mm = Number(m[2]);

  if (!(y >= 2000 && y <= 2100 && mm >= 1 && mm <= 12)) {
    return null;
  }

  const start = new Date(Date.UTC(y, mm - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, mm, 1, 0, 0, 0));

  return {
    monthKey: finalMonth,
    start,
    end,
  };
}

async function getClientOrThrow(id) {
  if (!isUuid(id)) throw buildError("Invalid client id");

  const client = await prisma.clients.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      hq_address: true,
      contact_name: true,
      contact_phone: true,
      contact_email: true,
      tax_no: true,
      notes: true,
      is_active: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!client) throw buildError("Client not found", 404);
  return client;
}

function buildClientUpdateData(body = {}, { requireName = false } = {}) {
  const data = {};

  if (requireName || body.name !== undefined) {
    const name = s(body.name);
    if (!name) throw buildError("name is required");
    data.name = name;
  }

  if (body.phone !== undefined) data.phone = s(body.phone);
  if (body.email !== undefined) data.email = s(body.email);
  if (body.hq_address !== undefined) data.hq_address = s(body.hq_address);
  if (body.contact_name !== undefined) data.contact_name = s(body.contact_name);
  if (body.contact_phone !== undefined) data.contact_phone = s(body.contact_phone);
  if (body.contact_email !== undefined) data.contact_email = s(body.contact_email);
  if (body.tax_no !== undefined) data.tax_no = s(body.tax_no);
  if (body.notes !== undefined) data.notes = s(body.notes);
  if (typeof body.is_active === "boolean") data.is_active = body.is_active;

  return data;
}

// =======================
// GET /clients
// query:
//  - search
//  - page
//  - limit
//  - is_active
// =======================
exports.listClients = async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const page = Math.max(1, parseIntSafe(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, parseIntSafe(req.query.limit, 50)));
    const skip = (page - 1) * limit;
    const is_active = toBool(req.query.is_active, null);

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { contact_name: { contains: search, mode: "insensitive" } },
        { contact_phone: { contains: search, mode: "insensitive" } },
        { tax_no: { contains: search, mode: "insensitive" } },
      ];
    }

    if (typeof is_active === "boolean") {
      where.is_active = is_active;
    }

    const [items, total] = await Promise.all([
      prisma.clients.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              sites: true,
              trips: true,
              contracts: true,
              ar_invoices: true,
              ar_payments: true,
            },
          },
        },
      }),
      prisma.clients.count({ where }),
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
    console.error("listClients error:", e);
    return res.status(e.statusCode || 500).json({
      success: false,
      message: e?.message || "Failed to load clients",
    });
  }
};

// =======================
// GET /clients/:id
// =======================
exports.getClientById = async (req, res) => {
  try {
    const { id } = req.params;

    const client = await prisma.clients.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            sites: true,
            trips: true,
            contracts: true,
            ar_invoices: true,
            ar_payments: true,
            trip_revenues: true,
          },
        },
      },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    return res.json({
      success: true,
      data: client,
    });
  } catch (e) {
    console.error("getClientById error:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to load client",
    });
  }
};

// =======================
// POST /clients
// =======================
exports.createClient = async (req, res) => {
  try {
    const data = buildClientUpdateData(req.body, { requireName: true });

    const created = await prisma.clients.create({
      data,
    });

    return res.status(201).json({
      success: true,
      message: "Client created successfully",
      data: created,
    });
  } catch (e) {
    console.error("createClient error:", e);
    return res.status(e.statusCode || 500).json({
      success: false,
      message: e?.message || "Failed to create client",
    });
  }
};

// =======================
// PUT /clients/:id
// =======================
exports.updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    await getClientOrThrow(id);

    const data = buildClientUpdateData(req.body, { requireName: true });

    const updated = await prisma.clients.update({
      where: { id },
      data,
    });

    return res.json({
      success: true,
      message: "Client updated successfully",
      data: updated,
    });
  } catch (e) {
    console.error("updateClient error:", e);
    return res.status(e.statusCode || 500).json({
      success: false,
      message: e?.message || "Failed to update client",
    });
  }
};

// =======================
// PUT /clients/:id/profile
// =======================
exports.updateClientProfile = async (req, res) => {
  try {
    const { id } = req.params;
    await getClientOrThrow(id);

    const data = buildClientUpdateData(req.body, { requireName: false });

    const updated = await prisma.clients.update({
      where: { id },
      data,
    });

    return res.json({
      success: true,
      message: "Client profile updated successfully",
      data: updated,
    });
  } catch (e) {
    console.error("updateClientProfile error:", e);
    return res.status(e.statusCode || 500).json({
      success: false,
      message: e?.message || "Failed to update client profile",
    });
  }
};

// =======================
// PATCH /clients/:id/toggle
// =======================
exports.toggleClient = async (req, res) => {
  try {
    const { id } = req.params;

    const exists = await prisma.clients.findUnique({
      where: { id },
      select: { id: true, is_active: true },
    });

    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    const updated = await prisma.clients.update({
      where: { id },
      data: { is_active: !exists.is_active },
    });

    return res.json({
      success: true,
      message: "Client status updated successfully",
      data: updated,
    });
  } catch (e) {
    console.error("toggleClient error:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle client",
    });
  }
};

// =======================
// GET /clients/:id/details?month=YYYY-MM
// returns:
// - client
// - sites
// - contracts_summary
// - ar_summary
// - trips_monthly_by_site
// - recent_invoices
// - recent_payments
// =======================
exports.getClientDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client id",
      });
    }

    const monthRange = parseMonthRange(req.query.month);
    if (!monthRange) {
      return res.status(400).json({
        success: false,
        message: "month must be YYYY-MM",
      });
    }

    const { monthKey, start, end } = monthRange;

    const client = await prisma.clients.findUnique({
      where: { id },
      include: {
        sites: {
          orderBy: { created_at: "desc" },
          include: {
            zones: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    const [
      invAgg,
      payAgg,
      grouped,
      recentInvoices,
      recentPayments,
      contractsAgg,
      recentContracts,
    ] = await Promise.all([
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
      prisma.trips.groupBy({
        by: ["site_id"],
        where: {
          client_id: id,
          created_at: { gte: start, lt: end },
        },
        _count: { _all: true },
      }),
      prisma.ar_invoices.findMany({
        where: { client_id: id },
        orderBy: { created_at: "desc" },
        take: 10,
        select: {
          id: true,
          invoice_no: true,
          issue_date: true,
          due_date: true,
          status: true,
          total_amount: true,
          contract_id: true,
        },
      }),
      prisma.ar_payments.findMany({
        where: { client_id: id },
        orderBy: { created_at: "desc" },
        take: 10,
        select: {
          id: true,
          payment_date: true,
          amount: true,
          method: true,
          status: true,
          reference: true,
        },
      }),
      prisma.client_contracts.groupBy({
        by: ["status"],
        where: { client_id: id },
        _count: { _all: true },
      }),
      prisma.client_contracts.findMany({
        where: { client_id: id },
        orderBy: [{ created_at: "desc" }],
        take: 10,
        select: {
          id: true,
          contract_no: true,
          start_date: true,
          end_date: true,
          billing_cycle: true,
          contract_value: true,
          currency: true,
          status: true,
          created_at: true,
        },
      }),
    ]);

    const totalInvoiced = Number(invAgg?._sum?.total_amount || 0);
    const totalPaid = Number(payAgg?._sum?.amount || 0);
    const balance = Math.round((totalInvoiced - totalPaid) * 100) / 100;

    const siteIds = grouped.map((g) => g.site_id).filter(Boolean);

    const sitesLookup = siteIds.length
      ? await prisma.sites.findMany({
          where: { id: { in: siteIds } },
          select: { id: true, name: true },
        })
      : [];

    const siteNameMap = new Map(sitesLookup.map((x) => [x.id, x.name]));

    const trips_monthly_by_site = grouped.map((g) => ({
      site_id: g.site_id,
      site_name: siteNameMap.get(g.site_id) || "—",
      month: monthKey,
      trips_count: g._count?._all || 0,
    }));

    const contracts_summary = {
      total_contracts: recentContracts.length,
      by_status: contractsAgg.reduce((acc, row) => {
        acc[row.status] = row._count?._all || 0;
        return acc;
      }, {}),
    };

    return res.json({
      success: true,
      data: {
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
        sites: (client.sites || []).map((site) => ({
          id: site.id,
          name: site.name,
          address: site.address,
          city: site.city,
          site_type: site.site_type,
          zone: site.zone,
          zone_id: site.zone_id,
          zone_name: site.zones?.name || null,
          is_active: site.is_active,
          created_at: site.created_at,
        })),
        contracts_summary,
        recent_contracts: recentContracts.map((x) => ({
          ...x,
          contract_value: Number(x.contract_value || 0),
        })),
        ar_summary: {
          total_invoiced: totalInvoiced,
          total_paid: totalPaid,
          balance,
        },
        trips_monthly_by_site,
        recent_invoices: recentInvoices.map((x) => ({
          ...x,
          total_amount: Number(x.total_amount || 0),
        })),
        recent_payments: recentPayments.map((x) => ({
          ...x,
          amount: Number(x.amount || 0),
        })),
      },
    });
  } catch (e) {
    console.error("getClientDetails error:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to load client details",
    });
  }
};

// =======================
// GET /clients/:id/dashboard?month=YYYY-MM
// =======================
exports.getClientDashboard = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid client id",
      });
    }

    const monthRange = parseMonthRange(req.query.month);
    if (!monthRange) {
      return res.status(400).json({
        success: false,
        message: "month must be YYYY-MM",
      });
    }

    const { monthKey, start, end } = monthRange;

    const client = await prisma.clients.findUnique({
      where: { id },
      include: {
        sites: {
          orderBy: { created_at: "desc" },
          include: {
            zones: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    const [invAgg, payAgg, tripGroups, tripRevenueAgg, contractsAgg] = await Promise.all([
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
      prisma.trips.groupBy({
        by: ["site_id"],
        where: {
          client_id: id,
          created_at: { gte: start, lt: end },
        },
        _count: { _all: true },
      }),
      prisma.trip_revenues.aggregate({
        where: {
          client_id: id,
          is_current: true,
          trips: {
            created_at: { gte: start, lt: end },
          },
        },
        _sum: { amount: true },
      }),
      prisma.client_contracts.groupBy({
        by: ["status"],
        where: { client_id: id },
        _count: { _all: true },
      }),
    ]);

    const totalInvoiced = Number(invAgg?._sum?.total_amount || 0);
    const totalPaid = Number(payAgg?._sum?.amount || 0);
    const balance = Math.round((totalInvoiced - totalPaid) * 100) / 100;
    const monthlyRevenue = Number(tripRevenueAgg?._sum?.amount || 0);

    const tripCountBySite = new Map(
      tripGroups.map((g) => [g.site_id, g._count._all])
    );

    const sites = (client.sites || []).map((site) => ({
      id: site.id,
      name: site.name,
      address: site.address,
      city: site.city,
      zone_id: site.zone_id,
      zone_name: site.zones?.name || null,
      is_active: site.is_active,
      trips_this_month: tripCountBySite.get(site.id) || 0,
    }));

    const totalTripsThisMonth = sites.reduce(
      (sum, site) => sum + Number(site.trips_this_month || 0),
      0
    );

    const contracts_by_status = contractsAgg.reduce((acc, row) => {
      acc[row.status] = row._count?._all || 0;
      return acc;
    }, {});

    return res.json({
      success: true,
      data: {
        client: {
          id: client.id,
          name: client.name,
          is_active: client.is_active,
        },
        month: monthKey,
        financial: {
          total_invoiced: totalInvoiced,
          total_paid: totalPaid,
          balance,
          monthly_trip_revenue: monthlyRevenue,
        },
        operations: {
          total_trips_this_month: totalTripsThisMonth,
          active_sites_count: sites.filter((x) => x.is_active).length,
          total_sites_count: sites.length,
        },
        contracts: {
          by_status: contracts_by_status,
        },
        sites,
      },
    });
  } catch (e) {
    console.error("getClientDashboard error:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to load client dashboard",
    });
  }
};