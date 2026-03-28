require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== BACKFILL INVENTORY COMPANY START ===");

  const warehouseParts = await prisma.warehouse_parts.findMany({
    select: { id: true, company_id: true, warehouse_id: true, part_id: true },
  });
  let warehousePartsUpdated = 0;
  for (const row of warehouseParts) {
    if (row.company_id) continue;
    const warehouse = await prisma.warehouses.findUnique({ where: { id: row.warehouse_id }, select: { company_id: true } });
    const part = await prisma.parts.findUnique({ where: { id: row.part_id }, select: { company_id: true } });
    if (!warehouse?.company_id || !part?.company_id || warehouse.company_id !== part.company_id) {
      throw new Error(`Company mismatch in warehouse_part ${row.id}`);
    }
    await prisma.warehouse_parts.update({ where: { id: row.id }, data: { company_id: warehouse.company_id } });
    warehousePartsUpdated++;
  }

  const partItems = await prisma.part_items.findMany({
    select: { id: true, company_id: true, part_id: true, warehouse_id: true, received_receipt_id: true, installed_vehicle_id: true },
  });
  let partItemsUpdated = 0;
  for (const row of partItems) {
    if (row.company_id) continue;
    const part = await prisma.parts.findUnique({ where: { id: row.part_id }, select: { company_id: true } });
    const warehouse = await prisma.warehouses.findUnique({ where: { id: row.warehouse_id }, select: { company_id: true } });
    if (!part?.company_id || !warehouse?.company_id || part.company_id !== warehouse.company_id) {
      throw new Error(`Company mismatch in part_item ${row.id}`);
    }
    if (row.received_receipt_id) {
      const receipt = await prisma.inventory_receipts.findUnique({ where: { id: row.received_receipt_id }, select: { company_id: true } });
      if (receipt?.company_id && receipt.company_id !== part.company_id) {
        throw new Error(`Receipt/company mismatch in part_item ${row.id}`);
      }
    }
    if (row.installed_vehicle_id) {
      const vehicle = await prisma.vehicles.findUnique({ where: { id: row.installed_vehicle_id }, select: { company_id: true } });
      if (vehicle?.company_id && vehicle.company_id !== part.company_id) {
        throw new Error(`Vehicle/company mismatch in part_item ${row.id}`);
      }
    }
    await prisma.part_items.update({ where: { id: row.id }, data: { company_id: part.company_id } });
    partItemsUpdated++;
  }

  const receipts = await prisma.inventory_receipts.findMany({
    select: { id: true, company_id: true, warehouse_id: true, vendor_id: true },
  });
  let receiptsUpdated = 0;
  for (const row of receipts) {
    if (row.company_id) continue;
    const warehouse = await prisma.warehouses.findUnique({ where: { id: row.warehouse_id }, select: { company_id: true } });
    if (!warehouse?.company_id) throw new Error(`Warehouse ${row.warehouse_id} has no company_id`);
    if (row.vendor_id) {
      const vendor = await prisma.vendors.findUnique({ where: { id: row.vendor_id }, select: { company_id: true } });
      if (!vendor?.company_id || vendor.company_id !== warehouse.company_id) {
        throw new Error(`Vendor/company mismatch in inventory_receipt ${row.id}`);
      }
    }
    await prisma.inventory_receipts.update({ where: { id: row.id }, data: { company_id: warehouse.company_id } });
    receiptsUpdated++;
  }

  const receiptItems = await prisma.inventory_receipt_items.findMany({
    select: { id: true, company_id: true, receipt_id: true, part_id: true },
  });
  let receiptItemsUpdated = 0;
  for (const row of receiptItems) {
    if (row.company_id) continue;
    const receipt = await prisma.inventory_receipts.findUnique({ where: { id: row.receipt_id }, select: { company_id: true } });
    const part = await prisma.parts.findUnique({ where: { id: row.part_id }, select: { company_id: true } });
    if (!receipt?.company_id || !part?.company_id || receipt.company_id !== part.company_id) {
      throw new Error(`Company mismatch in inventory_receipt_item ${row.id}`);
    }
    await prisma.inventory_receipt_items.update({ where: { id: row.id }, data: { company_id: receipt.company_id } });
    receiptItemsUpdated++;
  }

  const receiptBulkLines = await prisma.inventory_receipt_bulk_lines.findMany({
    select: { id: true, company_id: true, receipt_id: true, part_id: true },
  });
  let receiptBulkLinesUpdated = 0;
  for (const row of receiptBulkLines) {
    if (row.company_id) continue;
    const receipt = await prisma.inventory_receipts.findUnique({ where: { id: row.receipt_id }, select: { company_id: true } });
    const part = await prisma.parts.findUnique({ where: { id: row.part_id }, select: { company_id: true } });
    if (!receipt?.company_id || !part?.company_id || receipt.company_id !== part.company_id) {
      throw new Error(`Company mismatch in inventory_receipt_bulk_line ${row.id}`);
    }
    await prisma.inventory_receipt_bulk_lines.update({ where: { id: row.id }, data: { company_id: receipt.company_id } });
    receiptBulkLinesUpdated++;
  }

  const requests = await prisma.inventory_requests.findMany({
    select: { id: true, company_id: true, warehouse_id: true, work_order_id: true },
  });
  let requestsUpdated = 0;
  for (const row of requests) {
    if (row.company_id) continue;
    const warehouse = await prisma.warehouses.findUnique({ where: { id: row.warehouse_id }, select: { company_id: true } });
    if (!warehouse?.company_id) throw new Error(`Warehouse ${row.warehouse_id} has no company_id`);
    if (row.work_order_id) {
      const workOrder = await prisma.maintenance_work_orders.findUnique({ where: { id: row.work_order_id }, select: { company_id: true } });
      if (!workOrder?.company_id || workOrder.company_id !== warehouse.company_id) {
        throw new Error(`Work order/company mismatch in inventory_request ${row.id}`);
      }
    }
    await prisma.inventory_requests.update({ where: { id: row.id }, data: { company_id: warehouse.company_id } });
    requestsUpdated++;
  }

  const requestLines = await prisma.inventory_request_lines.findMany({
    select: { id: true, company_id: true, request_id: true, part_id: true },
  });
  let requestLinesUpdated = 0;
  for (const row of requestLines) {
    if (row.company_id) continue;
    const request = await prisma.inventory_requests.findUnique({ where: { id: row.request_id }, select: { company_id: true } });
    const part = await prisma.parts.findUnique({ where: { id: row.part_id }, select: { company_id: true } });
    if (!request?.company_id || !part?.company_id || request.company_id !== part.company_id) {
      throw new Error(`Company mismatch in inventory_request_line ${row.id}`);
    }
    await prisma.inventory_request_lines.update({ where: { id: row.id }, data: { company_id: request.company_id } });
    requestLinesUpdated++;
  }

  const reservations = await prisma.inventory_request_reservations.findMany({
    select: { id: true, company_id: true, request_id: true, part_item_id: true },
  });
  let reservationsUpdated = 0;
  for (const row of reservations) {
    if (row.company_id) continue;
    const request = await prisma.inventory_requests.findUnique({ where: { id: row.request_id }, select: { company_id: true } });
    const partItem = await prisma.part_items.findUnique({ where: { id: row.part_item_id }, select: { company_id: true } });
    if (!request?.company_id || !partItem?.company_id || request.company_id !== partItem.company_id) {
      throw new Error(`Company mismatch in inventory_request_reservation ${row.id}`);
    }
    await prisma.inventory_request_reservations.update({ where: { id: row.id }, data: { company_id: request.company_id } });
    reservationsUpdated++;
  }

  const issues = await prisma.inventory_issues.findMany({
    select: { id: true, company_id: true, work_order_id: true, request_id: true, warehouse_id: true },
  });
  let issuesUpdated = 0;
  for (const row of issues) {
    if (row.company_id) continue;
    const workOrder = await prisma.maintenance_work_orders.findUnique({ where: { id: row.work_order_id }, select: { company_id: true } });
    if (!workOrder?.company_id) throw new Error(`Work order ${row.work_order_id} has no company_id`);
    if (row.request_id) {
      const request = await prisma.inventory_requests.findUnique({ where: { id: row.request_id }, select: { company_id: true } });
      if (!request?.company_id || request.company_id !== workOrder.company_id) {
        throw new Error(`Request/company mismatch in inventory_issue ${row.id}`);
      }
    }
    if (row.warehouse_id) {
      const warehouse = await prisma.warehouses.findUnique({ where: { id: row.warehouse_id }, select: { company_id: true } });
      if (!warehouse?.company_id || warehouse.company_id !== workOrder.company_id) {
        throw new Error(`Warehouse/company mismatch in inventory_issue ${row.id}`);
      }
    }
    await prisma.inventory_issues.update({ where: { id: row.id }, data: { company_id: workOrder.company_id } });
    issuesUpdated++;
  }

  const issueLines = await prisma.inventory_issue_lines.findMany({
    select: { id: true, company_id: true, issue_id: true, part_id: true, part_item_id: true },
  });
  let issueLinesUpdated = 0;
  for (const row of issueLines) {
    if (row.company_id) continue;
    const issue = await prisma.inventory_issues.findUnique({ where: { id: row.issue_id }, select: { company_id: true } });
    const part = await prisma.parts.findUnique({ where: { id: row.part_id }, select: { company_id: true } });
    if (!issue?.company_id || !part?.company_id || issue.company_id !== part.company_id) {
      throw new Error(`Company mismatch in inventory_issue_line ${row.id}`);
    }
    if (row.part_item_id) {
      const partItem = await prisma.part_items.findUnique({ where: { id: row.part_item_id }, select: { company_id: true } });
      if (!partItem?.company_id || partItem.company_id !== issue.company_id) {
        throw new Error(`Part item/company mismatch in inventory_issue_line ${row.id}`);
      }
    }
    await prisma.inventory_issue_lines.update({ where: { id: row.id }, data: { company_id: issue.company_id } });
    issueLinesUpdated++;
  }

  const installations = await prisma.work_order_installations.findMany({
    select: { id: true, company_id: true, work_order_id: true, vehicle_id: true, part_id: true, part_item_id: true },
  });
  let installationsUpdated = 0;
  for (const row of installations) {
    if (row.company_id) continue;
    const workOrder = await prisma.maintenance_work_orders.findUnique({ where: { id: row.work_order_id }, select: { company_id: true } });
    const vehicle = await prisma.vehicles.findUnique({ where: { id: row.vehicle_id }, select: { company_id: true } });
    const part = await prisma.parts.findUnique({ where: { id: row.part_id }, select: { company_id: true } });
    if (!workOrder?.company_id || !vehicle?.company_id || !part?.company_id) {
      throw new Error(`Missing company in work_order_installation ${row.id}`);
    }
    if (workOrder.company_id !== vehicle.company_id || workOrder.company_id !== part.company_id) {
      throw new Error(`Company mismatch in work_order_installation ${row.id}`);
    }
    if (row.part_item_id) {
      const partItem = await prisma.part_items.findUnique({ where: { id: row.part_item_id }, select: { company_id: true } });
      if (!partItem?.company_id || partItem.company_id !== workOrder.company_id) {
        throw new Error(`Part item/company mismatch in work_order_installation ${row.id}`);
      }
    }
    await prisma.work_order_installations.update({ where: { id: row.id }, data: { company_id: workOrder.company_id } });
    installationsUpdated++;
  }

  console.log("Warehouse parts updated:", warehousePartsUpdated);
  console.log("Part items updated:", partItemsUpdated);
  console.log("Inventory receipts updated:", receiptsUpdated);
  console.log("Inventory receipt items updated:", receiptItemsUpdated);
  console.log("Inventory receipt bulk lines updated:", receiptBulkLinesUpdated);
  console.log("Inventory requests updated:", requestsUpdated);
  console.log("Inventory request lines updated:", requestLinesUpdated);
  console.log("Inventory request reservations updated:", reservationsUpdated);
  console.log("Inventory issues updated:", issuesUpdated);
  console.log("Inventory issue lines updated:", issueLinesUpdated);
  console.log("Work order installations updated:", installationsUpdated);
  console.log("=== BACKFILL INVENTORY COMPANY END ===");
}

main()
  .catch((error) => {
    console.error("BACKFILL INVENTORY COMPANY FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });