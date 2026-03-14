const prisma = require("../prisma");

async function getTripsSummary({ range, scope }) {
  const rows = await prisma.trips.findMany({
    where: {
      created_at: {
        gte: range.from,
        lte: range.to,
      },
    },
    select: {
      id: true,
      status: true,
      financial_status: true,
      client_id: true,
      site_id: true,
      created_at: true,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  let active_count = 0;
  let draft_count = 0;
  let completed_count = 0;
  let cancelled_count = 0;
  let need_financial_closure_count = 0;

  for (const row of rows) {
    const status = String(row.status || "").toUpperCase();
    const financialStatus = String(row.financial_status || "").toUpperCase();

    if (["ACTIVE", "IN_PROGRESS", "ONGOING", "STARTED"].includes(status)) {
      active_count += 1;
    } else if (status === "DRAFT") {
      draft_count += 1;
    } else if (["COMPLETED", "DONE", "CLOSED"].includes(status)) {
      completed_count += 1;
    } else if (["CANCELLED", "CANCELED"].includes(status)) {
      cancelled_count += 1;
    }

    if (
      ["COMPLETED", "DONE"].includes(status) &&
      ["OPEN", "REOPENED", ""].includes(financialStatus)
    ) {
      need_financial_closure_count += 1;
    }
  }

  return {
    metric: "trips_summary",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      role: scope?.role || null,
    },
    data: {
      total_trips: rows.length,
      active_count,
      draft_count,
      completed_count,
      cancelled_count,
      need_financial_closure_count,
    },
    summary: {},
  };
}

async function getActiveTrips({ range, scope, limit = 10 }) {
  const rows = await prisma.trips.findMany({
    where: {
      created_at: {
        gte: range.from,
        lte: range.to,
      },
      status: {
        in: ["ACTIVE", "IN_PROGRESS", "ONGOING", "STARTED"],
      },
    },
    select: {
      id: true,
      status: true,
      scheduled_at: true,
      created_at: true,
      financial_status: true,
      clients: {
        select: {
          id: true,
          name: true,
        },
      },
      sites: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [
      { scheduled_at: "desc" },
      { created_at: "desc" },
    ],
    take: limit,
  });

  return {
    metric: "active_trips",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      role: scope?.role || null,
      limit,
    },
    data: {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        financial_status: row.financial_status,
        scheduled_at: row.scheduled_at,
        created_at: row.created_at,
        client_name: row.clients?.name || "عميل غير معروف",
        site_name: row.sites?.name || "موقع غير معروف",
      })),
    },
    summary: {
      active_count: rows.length,
    },
  };
}

async function getTripsNeedingFinancialClosure({ range, scope, limit = 10 }) {
  const rows = await prisma.trips.findMany({
    where: {
      created_at: {
        gte: range.from,
        lte: range.to,
      },
      status: {
        in: ["COMPLETED", "DONE"],
      },
      financial_status: {
        in: ["OPEN", "REOPENED"],
      },
    },
    select: {
      id: true,
      status: true,
      financial_status: true,
      scheduled_at: true,
      created_at: true,
      clients: {
        select: {
          id: true,
          name: true,
        },
      },
      sites: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
    take: limit,
  });

  return {
    metric: "trips_need_financial_closure",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      role: scope?.role || null,
      limit,
    },
    data: {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        financial_status: row.financial_status,
        scheduled_at: row.scheduled_at,
        created_at: row.created_at,
        client_name: row.clients?.name || "عميل غير معروف",
        site_name: row.sites?.name || "موقع غير معروف",
      })),
      total_need_financial_closure: rows.length,
    },
    summary: {},
  };
}

async function getTopClientsByTrips({ range, scope, limit = 10 }) {
  const rows = await prisma.trips.groupBy({
    by: ["client_id"],
    where: {
      created_at: {
        gte: range.from,
        lte: range.to,
      },
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _count: {
        client_id: "desc",
      },
    },
    take: limit,
  });

  const clientIds = rows.map((r) => r.client_id).filter(Boolean);

  const clients = clientIds.length
    ? await prisma.clients.findMany({
        where: {
          id: { in: clientIds },
        },
        select: {
          id: true,
          name: true,
        },
      })
    : [];

  const clientMap = new Map(clients.map((c) => [c.id, c.name]));

  const items = rows.map((row) => ({
    client_id: row.client_id,
    client_name: clientMap.get(row.client_id) || "عميل غير معروف",
    trips_count: row._count?._all || 0,
  }));

  return {
    metric: "top_clients_by_trips",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      role: scope?.role || null,
      limit,
    },
    data: {
      items,
    },
    summary: {
      clients_count: items.length,
      total_trips: items.reduce((sum, x) => sum + Number(x.trips_count || 0), 0),
    },
  };
}

async function getTopSitesByTrips({ range, scope, limit = 10 }) {
  const rows = await prisma.trips.groupBy({
    by: ["site_id"],
    where: {
      created_at: {
        gte: range.from,
        lte: range.to,
      },
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _count: {
        site_id: "desc",
      },
    },
    take: limit,
  });

  const siteIds = rows.map((r) => r.site_id).filter(Boolean);

  const sites = siteIds.length
    ? await prisma.sites.findMany({
        where: {
          id: { in: siteIds },
        },
        select: {
          id: true,
          name: true,
        },
      })
    : [];

  const siteMap = new Map(sites.map((s) => [s.id, s.name]));

  const items = rows.map((row) => ({
    site_id: row.site_id,
    site_name: siteMap.get(row.site_id) || "موقع غير معروف",
    trips_count: row._count?._all || 0,
  }));

  return {
    metric: "top_sites_by_trips",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      role: scope?.role || null,
      limit,
    },
    data: {
      items,
    },
    summary: {
      sites_count: items.length,
      total_trips: items.reduce((sum, x) => sum + Number(x.trips_count || 0), 0),
    },
  };
}

async function getTopVehiclesByTrips({ range, scope, limit = 10 }) {
  const rows = await prisma.trip_assignments.groupBy({
    by: ["vehicle_id"],
    where: {
      assigned_at: {
        gte: range.from,
        lte: range.to,
      },
      vehicle_id: {
        not: null,
      },
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _count: {
        vehicle_id: "desc",
      },
    },
    take: limit,
  });

  const vehicleIds = rows.map((r) => r.vehicle_id).filter(Boolean);

  const vehicles = vehicleIds.length
    ? await prisma.vehicles.findMany({
        where: {
          id: { in: vehicleIds },
        },
        select: {
          id: true,
          fleet_no: true,
          plate_no: true,
          display_name: true,
        },
      })
    : [];

  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

  const items = rows.map((row) => {
    const vehicle = vehicleMap.get(row.vehicle_id);
    return {
      vehicle_id: row.vehicle_id,
      display_name: vehicle?.display_name || null,
      fleet_no: vehicle?.fleet_no || null,
      plate_no: vehicle?.plate_no || null,
      trips_count: row._count?._all || 0,
    };
  });

  return {
    metric: "top_vehicles_by_trips",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      role: scope?.role || null,
      limit,
    },
    data: {
      items,
    },
    summary: {
      vehicles_count: items.length,
      total_trips: items.reduce((sum, x) => sum + Number(x.trips_count || 0), 0),
    },
  };
}

module.exports = {
  getTripsSummary,
  getActiveTrips,
  getTripsNeedingFinancialClosure,
  getTopClientsByTrips,
  getTopSitesByTrips,
  getTopVehiclesByTrips,
};