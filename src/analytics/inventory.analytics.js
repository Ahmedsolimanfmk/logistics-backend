const prisma = require("../maintenance/prisma");

function toMoney(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

async function getTopIssuedParts({ companyId, range, scope, limit = 10 }) {
  const rows = await prisma.inventory_issue_lines.findMany({
    where: {
      company_id: companyId,
      issue: {
        company_id: companyId,
        issued_at: {
          gte: range.from,
          lte: range.to,
        },
        status: "POSTED",
      },
    },
    select: {
      id: true,
      part_id: true,
      qty: true,
      total_cost: true,
      part: {
        select: {
          id: true,
          name: true,
          part_number: true,
          category: true,
        },
      },
    },
    orderBy: {
      id: "desc",
    },
    take: 5000,
  });

  const map = new Map();

  for (const row of rows) {
    const key = row.part_id || "__UNKNOWN__";
    const prev = map.get(key) || {
      part_id: row.part_id,
      part_name: row.part?.name || "صنف غير معروف",
      part_number: row.part?.part_number || null,
      category: row.part?.category || null,
      total_issued_qty: 0,
      total_cost: 0,
      issue_lines_count: 0,
    };

    prev.total_issued_qty += Number(row.qty || 0);
    prev.total_cost += Number(row.total_cost || 0);
    prev.issue_lines_count += 1;

    map.set(key, prev);
  }

  const items = Array.from(map.values())
    .map((item) => ({
      ...item,
      total_cost: toMoney(item.total_cost),
    }))
    .sort((a, b) => b.total_issued_qty - a.total_issued_qty)
    .slice(0, limit);

  return {
    metric: "inventory_top_issued_parts",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      company_id: companyId,
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
      total_cost: toMoney(
        items.reduce((sum, x) => sum + Number(x.total_cost || 0), 0)
      ),
    },
  };
}

async function getLowStockItems({ companyId, scope, limit = 10 }) {
  const rows = await prisma.warehouse_parts.findMany({
    where: {
      company_id: companyId,
      part: {
        company_id: companyId,
        is_active: true,
      },
      warehouse: {
        company_id: companyId,
      },
    },
    select: {
      id: true,
      qty_on_hand: true,
      warehouse_id: true,
      part_id: true,
      part: {
        select: {
          id: true,
          name: true,
          part_number: true,
          category: true,
          min_stock: true,
        },
      },
      warehouse: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      qty_on_hand: "asc",
    },
    take: 500,
  });

  const filtered = rows
    .filter((row) => {
      const minStock = Number(row.part?.min_stock || 0);
      return minStock > 0 && Number(row.qty_on_hand || 0) <= minStock;
    })
    .slice(0, limit);

  const items = filtered.map((row) => ({
    warehouse_id: row.warehouse?.id || row.warehouse_id,
    warehouse_name: row.warehouse?.name || "مخزن غير معروف",
    part_id: row.part?.id || row.part_id,
    part_name: row.part?.name || "صنف غير معروف",
    part_number: row.part?.part_number || null,
    category: row.part?.category || null,
    qty_on_hand: Number(row.qty_on_hand || 0),
    min_stock: Number(row.part?.min_stock || 0),
    shortage: Math.max(
      0,
      Number(row.part?.min_stock || 0) - Number(row.qty_on_hand || 0)
    ),
  }));

  return {
    metric: "inventory_low_stock_items",
    filters: {
      company_id: companyId,
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