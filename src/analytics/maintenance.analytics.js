const prisma = require("../prisma");

async function getOpenWorkOrders({ range, scope }) {
  const rows = await prisma.maintenance_work_orders.findMany({
    where: {
      created_at: {
        gte: range.from,
        lte: range.to,
      },
      status: {
        notIn: ["COMPLETED", "CANCELLED"],
      },
    },
    select: {
      id: true,
      status: true,
      type: true,
      opened_at: true,
      created_at: true,
      vehicle_id: true,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  const byStatusMap = new Map();

  for (const row of rows) {
    const status = String(row.status || "UNKNOWN").toUpperCase();
    byStatusMap.set(status, (byStatusMap.get(status) || 0) + 1);
  }

  const by_status = Array.from(byStatusMap.entries()).map(([status, count]) => ({
    status,
    count,
  }));

  return {
    metric: "maintenance_open_work_orders",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      role: scope?.role || null,
    },
    data: {
      total_open_work_orders: rows.length,
      by_status,
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        type: row.type,
        opened_at: row.opened_at,
        created_at: row.created_at,
        vehicle_id: row.vehicle_id,
      })),
    },
    summary: {
      statuses_count: by_status.length,
    },
  };
}

async function getCostByVehicle({ range, scope, limit = 10 }) {
  const rows = await prisma.cash_expenses.groupBy({
    by: ["vehicle_id"],
    where: {
      created_at: {
        gte: range.from,
        lte: range.to,
      },
      maintenance_work_order_id: {
        not: null,
      },
      vehicle_id: {
        not: null,
      },
      approval_status: {
        in: ["APPROVED", "PENDING"],
      },
    },
    _sum: {
      amount: true,
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _sum: {
        amount: "desc",
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
      fleet_no: vehicle?.fleet_no || null,
      plate_no: vehicle?.plate_no || null,
      display_name: vehicle?.display_name || null,
      total_cost: Number(row._sum.amount || 0),
      expense_count: row._count._all || 0,
    };
  });

  return {
    metric: "maintenance_cost_by_vehicle",
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
      currency: "EGP",
      vehicles_count: items.length,
      total_cost: items.reduce((sum, x) => sum + x.total_cost, 0),
    },
  };
}

module.exports = {
  getOpenWorkOrders,
  getCostByVehicle,
};