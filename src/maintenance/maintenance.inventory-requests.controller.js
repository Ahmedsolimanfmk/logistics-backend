const prisma = require("../prisma");
const {
  getAuthUserId,
  getCompanyIdOrThrow,
} = require("../core/request-context");
const { assertUuid } = require("../core/validation");

function toInt(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

async function assertWorkOrder(req, workOrderId) {
  const companyId = getCompanyIdOrThrow(req);

  const wo = await prisma.maintenance_work_orders.findFirst({
    where: {
      id: workOrderId,
      company_id: companyId,
    },
    select: {
      id: true,
      company_id: true,
      status: true,
      vehicle_id: true,
    },
  });

  if (!wo) {
    const e = new Error("Work order not found");
    e.statusCode = 404;
    throw e;
  }

  const st = String(wo.status || "").toUpperCase();
  if (["COMPLETED", "CANCELED", "CANCELLED"].includes(st)) {
    const e = new Error(`Work order is ${wo.status}`);
    e.statusCode = 409;
    throw e;
  }

  return wo;
}

// POST /maintenance/work-orders/:id/inventory-requests
async function createInventoryRequestForWorkOrder(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const workOrderId = String(req.params.id || "").trim();
    assertUuid(workOrderId, "work order id");

    const { warehouse_id, notes } = req.body || {};
    assertUuid(String(warehouse_id || ""), "warehouse_id");

    await assertWorkOrder(req, workOrderId);

    const warehouse = await prisma.warehouses.findFirst({
      where: {
        id: String(warehouse_id),
        company_id: companyId,
      },
      select: {
        id: true,
      },
    });

    if (!warehouse) {
      return res.status(404).json({ message: "Warehouse not found" });
    }

    const row = await prisma.inventory_requests.create({
      data: {
        company_id: companyId,
        warehouse_id: String(warehouse_id),
        work_order_id: workOrderId,
        requested_by: userId,
        status: "PENDING",
        notes: notes ? String(notes).trim() : null,
      },
      include: {
        warehouse: true,
        lines: {
          include: {
            part: true,
          },
        },
      },
    });

    return res.status(201).json({
      message: "Inventory request created",
      request: row,
    });
  } catch (e) {
    const sc = e?.statusCode || 500;

    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("CREATE INVENTORY REQUEST ERROR:", e);
    return res.status(500).json({
      message: "Failed to create inventory request",
      error: e?.message || String(e),
      code: e?.code,
      meta: e?.meta,
    });
  }
}

// POST /maintenance/inventory-requests/:requestId/lines
async function addInventoryRequestLines(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const requestId = String(req.params.requestId || "").trim();
    assertUuid(requestId, "inventory request id");

    const { lines } = req.body || {};
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: "lines[] is required" });
    }

    const reqRow = await prisma.inventory_requests.findFirst({
      where: {
        id: requestId,
        company_id: companyId,
      },
      select: {
        id: true,
        status: true,
        work_order_id: true,
      },
    });

    if (!reqRow) {
      return res.status(404).json({ message: "Inventory request not found" });
    }

    const st = String(reqRow.status || "").toUpperCase();
    if (st !== "PENDING") {
      return res.status(409).json({
        message: `Inventory request is ${reqRow.status}`,
      });
    }

    if (reqRow.work_order_id) {
      await assertWorkOrder(req, reqRow.work_order_id);
    }

    const payload = [];

    for (const [idx, line] of lines.entries()) {
      const partId = String(line?.part_id || "").trim();
      const neededQty = toInt(line?.needed_qty ?? line?.qty, 0);

      assertUuid(partId, `lines[${idx}].part_id`);

      if (!Number.isFinite(neededQty) || neededQty <= 0) {
        return res.status(400).json({
          message: `lines[${idx}].needed_qty must be > 0`,
        });
      }

      payload.push({
        company_id: companyId,
        request_id: requestId,
        part_id: partId,
        needed_qty: neededQty,
        notes: line?.notes ? String(line.notes).trim() : null,
      });
    }

    const partIds = [...new Set(payload.map((p) => p.part_id))];

    const parts = await prisma.parts.findMany({
      where: {
        company_id: companyId,
        id: { in: partIds },
      },
      select: { id: true },
    });

    if (parts.length !== partIds.length) {
      return res.status(400).json({ message: "One or more part_id not found" });
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.inventory_request_lines.deleteMany({
        where: {
          company_id: companyId,
          request_id: requestId,
        },
      });

      const rows = await Promise.all(
        payload.map((p) =>
          tx.inventory_request_lines.create({
            data: p,
            include: {
              part: true,
            },
          })
        )
      );

      await tx.inventory_requests.updateMany({
        where: {
          id: requestId,
          company_id: companyId,
        },
        data: {
          updated_at: new Date(),
        },
      });

      return rows;
    });

    return res.status(201).json({
      message: "Inventory request lines saved",
      lines: created,
    });
  } catch (e) {
    const sc = e?.statusCode || 500;

    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("ADD INVENTORY REQUEST LINES ERROR:", e);
    return res.status(500).json({
      message: "Failed to add inventory request lines",
      error: e?.message || String(e),
      code: e?.code,
      meta: e?.meta,
    });
  }
}

// GET /maintenance/work-orders/:id/inventory-requests
async function listInventoryRequestsForWorkOrder(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const workOrderId = String(req.params.id || "").trim();
    assertUuid(workOrderId, "work order id");

    await assertWorkOrder(req, workOrderId);

    const items = await prisma.inventory_requests.findMany({
      where: {
        company_id: companyId,
        work_order_id: workOrderId,
      },
      orderBy: {
        created_at: "desc",
      },
      include: {
        warehouse: true,
        requested_by_user: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
        approved_by_user: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
        rejected_by_user: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
        lines: {
          include: {
            part: true,
          },
        },
      },
    });

    return res.json({ items });
  } catch (e) {
    const sc = e?.statusCode || 500;

    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("LIST INVENTORY REQUESTS FOR WO ERROR:", e);
    return res.status(500).json({
      message: "Failed to list inventory requests",
      error: e?.message || String(e),
      code: e?.code,
      meta: e?.meta,
    });
  }
}

module.exports = {
  createInventoryRequestForWorkOrder,
  addInventoryRequestLines,
  listInventoryRequestsForWorkOrder,
};