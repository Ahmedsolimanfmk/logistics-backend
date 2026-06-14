// =======================
// src/inventory/dashboard.controller.js
// =======================

const prisma = require("../maintenance/prisma");

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function requireCompanyId(req, res) {
  const companyId = req.companyId;

  if (!isUuid(companyId)) {
    res.status(400).json({ message: "Invalid company context" });
    return null;
  }

  return companyId;
}

async function getInventoryDashboard(req, res) {
  try {
    const companyId = requireCompanyId(req, res);
    if (!companyId) return;

    // 1. Total Parts & Total Warehouses
    const totalParts = await prisma.parts.count({ where: { company_id: companyId, is_active: true } });
    const totalWarehouses = await prisma.warehouses.count({ where: { company_id: companyId, is_active: true } });

    // 2. Financial Valuation
    // Sum (qty_on_hand * default_unit_cost)
    const stockItems = await prisma.warehouse_parts.findMany({
      where: { company_id: companyId },
      include: {
        part: { select: { default_unit_cost: true } }
      }
    });

    let totalValue = 0;
    stockItems.forEach(item => {
      const qty = Number(item.qty_on_hand || 0);
      const cost = Number(item.part?.default_unit_cost || 0);
      totalValue += (qty * cost);
    });

    // 3. Low Stock Alerts
    // We can find items where qty_on_hand <= part.min_stock
    const lowStockItemsRaw = await prisma.$queryRaw`
      SELECT wp.part_id, p.name as part_name, p.part_number, w.name as warehouse_name, wp.qty_on_hand, p.min_stock 
      FROM warehouse_parts wp
      JOIN parts p ON wp.part_id = p.id
      JOIN warehouses w ON wp.warehouse_id = w.id
      WHERE wp.company_id = ${companyId}::uuid
        AND p.min_stock IS NOT NULL
        AND wp.qty_on_hand <= p.min_stock
      LIMIT 10;
    `;

    // Convert Decimals / BigInts from raw query
    const lowStockItems = lowStockItemsRaw.map(item => ({
      part_id: item.part_id,
      part_name: item.part_name,
      part_number: item.part_number,
      warehouse_name: item.warehouse_name,
      qty_on_hand: Number(item.qty_on_hand || 0),
      min_stock: Number(item.min_stock || 0)
    }));

    // 4. Most Consumed Parts (Last 30 Days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const topConsumedRaw = await prisma.inventory_issue_lines.groupBy({
      by: ['part_id'],
      where: {
        issue: {
          company_id: companyId,
          issue_date: { gte: thirtyDaysAgo },
          status: 'POSTED'
        }
      },
      _sum: {
        quantity: true,
        cost: true
      },
      orderBy: {
        _sum: { quantity: 'desc' }
      },
      take: 5
    });

    // Fetch part names for top consumed
    const topConsumedPartsIds = topConsumedRaw.map(t => t.part_id);
    const topConsumedPartsData = await prisma.parts.findMany({
      where: { id: { in: topConsumedPartsIds } },
      select: { id: true, name: true, part_number: true, unit: true }
    });
    
    const topConsumed = topConsumedRaw.map(t => {
      const p = topConsumedPartsData.find(x => x.id === t.part_id);
      return {
        part_id: t.part_id,
        part_name: p?.name || "Unknown",
        part_number: p?.part_number || "-",
        unit: p?.unit || "-",
        total_quantity: Number(t._sum.quantity || 0),
        total_cost: Number(t._sum.cost || 0)
      };
    });

    // 5. Recent Issues
    const recentIssues = await prisma.inventory_issues.findMany({
      where: { company_id: companyId },
      orderBy: { issue_date: 'desc' },
      take: 5,
      select: {
        id: true,
        issue_date: true,
        status: true,
        vehicle: { select: { plate_number: true, code: true } }
      }
    });

    // 6. Recent Receipts
    const recentReceipts = await prisma.inventory_receipts.findMany({
      where: { company_id: companyId },
      orderBy: { receipt_date: 'desc' },
      take: 5,
      select: {
        id: true,
        receipt_date: true,
        status: true,
        vendor: { select: { name: true } },
        warehouse: { select: { name: true } }
      }
    });

    res.json({
      totalValue,
      totalParts,
      totalWarehouses,
      lowStockItems,
      topConsumed,
      recentIssues: recentIssues.map(i => ({
        id: i.id,
        date: i.issue_date,
        status: i.status,
        vehicle: i.vehicle?.plate_number || i.vehicle?.code || "-"
      })),
      recentReceipts: recentReceipts.map(r => ({
        id: r.id,
        date: r.receipt_date,
        status: r.status,
        vendor: r.vendor?.name || "-",
        warehouse: r.warehouse?.name || "-"
      }))
    });

  } catch (error) {
    console.error("getInventoryDashboard error:", error);
    res.status(500).json({ message: "Failed to fetch inventory dashboard" });
  }
}

module.exports = {
  getInventoryDashboard
};
