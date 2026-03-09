const prisma = require("../prisma");

async function getTopIssuedParts({ range, scope, limit = 10 }) {
  const rows = await prisma.inventory_issue_lines.groupBy({
    by: ["part_id"],
    where: {
      inventory_issues: {
        issued_at: {
          gte: range.from,
          lte: range.to,
        },
        status: {
          in: ["POSTED", "DRAFT", "ISSUED"],
        },
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
      total_qty: Number(row._sum.qty || 0),
      total_cost: Number(row._sum.total_cost || 0),
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
      total_qty: items.reduce((sum, x) => sum + x.total_qty, 0),
      total_cost: items.reduce((sum, x) => sum + x.total_cost, 0),
    },
  };
}

module.exports = {
  getTopIssuedParts,
};