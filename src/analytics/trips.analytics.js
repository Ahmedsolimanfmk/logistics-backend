const prisma = require("../prisma");

function normalizeHint(v) {
  return String(v || "").trim();
}

async function resolveVehicleIdsByHint(vehicleHint) {
  const hint = normalizeHint(vehicleHint);
  if (!hint) return null;

  const vehicles = await prisma.vehicles.findMany({
    where: {
      OR: [
        { id: hint },
        { fleet_no: { contains: hint } },
        { plate_no: { contains: hint } },
        { display_name: { contains: hint } },
      ],
    },
    select: {
      id: true,
    },
    take: 20,
  });

  const ids = vehicles.map((v) => v.id).filter(Boolean);
  return ids.length ? ids : ["__NO_MATCH__"];
}

async function resolveClientIdsByHint(clientHint) {
  const hint = normalizeHint(clientHint);
  if (!hint) return null;

  const clients = await prisma.clients.findMany({
    where: {
      OR: [{ id: hint }, { name: { contains: hint } }],
    },
    select: {
      id: true,
    },
    take: 20,
  });

  const ids = clients.map((c) => c.id).filter(Boolean);
  return ids.length ? ids : ["__NO_MATCH__"];
}

async function resolveSiteIdsByHint(siteHint) {
  const hint = normalizeHint(siteHint);
  if (!hint) return null;

  const sites = await prisma.sites.findMany({
    where: {
      OR: [{ id: hint }, { name: { contains: hint } }],
    },
    select: {
      id: true,
    },
    take: 20,
  });

  const ids = sites.map((s) => s.id).filter(Boolean);
  return ids.length ? ids : ["__NO_MATCH__"];
}

async function buildTripsWhere({ range, query = {} }) {
  const where = {
    created_at: {
      gte: range.from,
      lte: range.to,
    },
  };

  if (query?.client_hint) {
    const clientIds = await resolveClientIdsByHint(query.client_hint);
    where.client_id = { in: clientIds };
  }

  if (query?.site_hint) {
    const siteIds = await resolveSiteIdsByHint(query.site_hint);
    where.site_id = { in: siteIds };
  }

  if (query?.status) {
    where.status = query.status;
  }

  return where;
}

async function resolveTripIdsByVehicleHint({ range, vehicleHint }) {
  if (!vehicleHint) return null;

  const vehicleIds = await resolveVehicleIdsByHint(vehicleHint);

  const assignments = await prisma.trip_assignments.findMany({
    where: {
      assigned_at: {
        gte: range.from,
        lte: range.to,
      },
      vehicle_id: {
        in: vehicleIds,
      },
    },
    select: {
      trip_id: true,
    },
  });

  const tripIds = assignments.map((a) => a.trip_id).filter(Boolean);
  return tripIds.length ? tripIds : ["__NO_MATCH__"];
}

async function getTripsSummary({ range, scope, query = {} }) {
  const where = await buildTripsWhere({ range, query });

  if (query?.vehicle_hint) {
    const tripIds = await resolveTripIdsByVehicleHint({
      range,
      vehicleHint: query.vehicle_hint,
    });
    where.id = { in: tripIds };
  }

  const rows = await prisma.trips.findMany({
    where,
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
      vehicle_hint: query?.vehicle_hint || null,
      client_hint: query?.client_hint || null,
      site_hint: query?.site_hint || null,
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

async function getActiveTrips({ range, scope, limit = 10, query = {} }) {
  const where = await buildTripsWhere({ range, query });

  where.status = {
    in: ["ACTIVE", "IN_PROGRESS", "ONGOING", "STARTED"],
  };

  if (query?.vehicle_hint) {
    const tripIds = await resolveTripIdsByVehicleHint({
      range,
      vehicleHint: query.vehicle_hint,
    });
    where.id = { in: tripIds };
  }

  const rows = await prisma.trips.findMany({
    where,
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
    orderBy: [{ scheduled_at: "desc" }, { created_at: "desc" }],
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
      vehicle_hint: query?.vehicle_hint || null,
      client_hint: query?.client_hint || null,
      site_hint: query?.site_hint || null,
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

async function getTripsNeedingFinancialClosure({ range, scope, limit = 10, query = {} }) {
  const where = await buildTripsWhere({ range, query });

  where.status = {
    in: ["COMPLETED", "DONE"],
  };

  where.financial_status = {
    in: ["OPEN", "REOPENED"],
  };

  if (query?.vehicle_hint) {
    const tripIds = await resolveTripIdsByVehicleHint({
      range,
      vehicleHint: query.vehicle_hint,
    });
    where.id = { in: tripIds };
  }

  const rows = await prisma.trips.findMany({
    where,
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
      vehicle_hint: query?.vehicle_hint || null,
      client_hint: query?.client_hint || null,
      site_hint: query?.site_hint || null,
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

async function getTopClientsByTrips({ range, scope, limit = 10, query = {} }) {
  const where = await buildTripsWhere({ range, query });

  if (query?.vehicle_hint) {
    const tripIds = await resolveTripIdsByVehicleHint({
      range,
      vehicleHint: query.vehicle_hint,
    });
    where.id = { in: tripIds };
  }

  const rows = await prisma.trips.groupBy({
    by: ["client_id"],
    where,
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

  const filteredRows = rows.filter((r) => r.client_id);

  const clientIds = filteredRows.map((r) => r.client_id);

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

  const items = filteredRows.map((row) => ({
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
      vehicle_hint: query?.vehicle_hint || null,
      client_hint: query?.client_hint || null,
      site_hint: query?.site_hint || null,
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

async function getTopSitesByTrips({ range, scope, limit = 10, query = {} }) {
  const where = await buildTripsWhere({ range, query });

  if (query?.vehicle_hint) {
    const tripIds = await resolveTripIdsByVehicleHint({
      range,
      vehicleHint: query.vehicle_hint,
    });
    where.id = { in: tripIds };
  }

  const rows = await prisma.trips.groupBy({
    by: ["site_id"],
    where,
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

  const filteredRows = rows.filter((r) => r.site_id);

  const siteIds = filteredRows.map((r) => r.site_id);

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

  const items = filteredRows.map((row) => ({
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
      vehicle_hint: query?.vehicle_hint || null,
      client_hint: query?.client_hint || null,
      site_hint: query?.site_hint || null,
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

async function getTopVehiclesByTrips({ range, scope, limit = 10, query = {} }) {
  const where = {
    assigned_at: {
      gte: range.from,
      lte: range.to,
    },
  };

  if (query?.vehicle_hint) {
    const vehicleIds = await resolveVehicleIdsByHint(query.vehicle_hint);
    where.vehicle_id = { in: vehicleIds };
  }

  if (query?.client_hint || query?.site_hint) {
    const tripWhere = await buildTripsWhere({ range, query });

    const trips = await prisma.trips.findMany({
      where: tripWhere,
      select: {
        id: true,
      },
    });

    const tripIds = trips.map((t) => t.id).filter(Boolean);
    where.trip_id = { in: tripIds.length ? tripIds : ["__NO_MATCH__"] };
  }

  const rows = await prisma.trip_assignments.groupBy({
    by: ["vehicle_id"],
    where,
    _count: {
      _all: true,
    },
    orderBy: {
      _count: {
        vehicle_id: "desc",
      },
    },
    take: limit * 3,
  });

  const filteredRows = rows.filter((r) => r.vehicle_id);

  const vehicleIds = filteredRows.map((r) => r.vehicle_id);

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

  const items = filteredRows
    .map((row) => {
      const vehicle = vehicleMap.get(row.vehicle_id);

      return {
        vehicle_id: row.vehicle_id,
        display_name: vehicle?.display_name || null,
        fleet_no: vehicle?.fleet_no || null,
        plate_no: vehicle?.plate_no || null,
        trips_count: row._count?._all || 0,
      };
    })
    .slice(0, limit);

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
      vehicle_hint: query?.vehicle_hint || null,
      client_hint: query?.client_hint || null,
      site_hint: query?.site_hint || null,
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