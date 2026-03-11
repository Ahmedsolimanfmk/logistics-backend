const prisma = require("../prisma");

function toMoney(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

async function getTopIssuedParts({ range, scope, limit = 10 }) {
  const rows = await prisma.inventory_issue_lines.groupBy({
    by: ["part_id"],
    where: {
      inventory_issues: {
        issued_at: {
          gte: range.from,
          lte: range.to,
        },
        status: "POSTED",
      },
    },
    _sum: {
      qty: true,
      total_cost: true,
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _sum: {
        qty: "desc",
      },
    },
    take: limit,
  });

  const partIds = rows.map((r) => r.part_id);

  const parts = partIds.length
    ? await prisma.parts.findMany({
        where: {
          id: { in: partIds },
        },
        select: {
          id: true,
          name: true,
          part_number: true,
          category: true,
        },
      })
    : [];

  const partMap = new Map(parts.map((p) => [p.id, p]));

  const items = rows.map((row) => {
    const part = partMap.get(row.part_id);
    return {
      part_id: row.part_id,
      part_name: part?.name || "صنف غير معروف",
      part_number: part?.part_number || null,
      category: part?.category || null,
      total_issued_qty: Number(row._sum.qty || 0),
      total_cost: toMoney(row._sum.total_cost || 0),
      issue_lines_count: row._count._all || 0,
    };
  });

  return {
    metric: "inventory_top_issued_parts",
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
      parts_count: items.length,
      total_issued_qty: items.reduce(
        (sum, x) => sum + Number(x.total_issued_qty || 0),
        0
      ),
      total_cost: toMoney(items.reduce((sum, x) => sum + Number(x.total_cost || 0), 0)),
    },
  };
}

async function getLowStockItems({ scope, limit = 10 }) {
  const rows = await prisma.warehouse_parts.findMany({
    where: {
      parts: {
        is_active: true,
      },
    },
    select: {
      id: true,
      qty_on_hand: true,
      warehouse_id: true,
      part_id: true,
      parts: {
        select: {
          id: true,
          name: true,
          part_number: true,
          category: true,
          min_stock: true,
        },
      },
      warehouses: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      qty_on_hand: "asc",
    },
  });

  const filtered = rows
    .filter((row) => {
      const minStock = Number(row.parts?.min_stock || 0);
      return minStock > 0 && Number(row.qty_on_hand || 0) <= minStock;
    })
    .slice(0, limit);

  const items = filtered.map((row) => ({
    warehouse_id: row.warehouses?.id || row.warehouse_id,
    warehouse_name: row.warehouses?.name || "مخزن غير معروف",
    part_id: row.parts?.id || row.part_id,
    part_name: row.parts?.name || "صنف غير معروف",
    part_number: row.parts?.part_number || null,
    category: row.parts?.category || null,
    qty_on_hand: Number(row.qty_on_hand || 0),
    min_stock: Number(row.parts?.min_stock || 0),
    shortage: Math.max(
      0,
      Number(row.parts?.min_stock || 0) - Number(row.qty_on_hand || 0)
    ),
  }));

  return {
    metric: "inventory_low_stock_items",
    filters: {
      role: scope?.role || null,
      limit,
    },
    data: {
      items,
    },
    summary: {
      items_count: items.length,
    },
  };
}

module.exports = {
  getTopIssuedParts,
  getLowStockItems,
};