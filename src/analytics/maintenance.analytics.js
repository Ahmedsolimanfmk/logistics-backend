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

module.exports = {
  getOpenWorkOrders,
};