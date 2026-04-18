const prisma = require("../prisma");
const {
  getAuthUserId,
  getCompanyIdOrThrow,
} = require("../core/request-context");
const { assertUuid } = require("../core/validation");
const { isAdminOrAccountant } = require("./maintenance.access");

// POST /maintenance/work-orders/:id/issues
async function createIssueForWorkOrder(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ADMIN/ACCOUNTANT can create issues (for now)",
      });
    }

    const workOrderId = String(req.params.id || "");
    assertUuid(workOrderId, "work order id");

    const { notes } = req.body || {};
    const now = new Date();

    const wo = await prisma.maintenance_work_orders.findFirst({
      where: {
        id: workOrderId,
        company_id: companyId,
      },
      select: {
        id: true,
        company_id: true,
        vehicle_id: true,
        status: true,
      },
    });

    if (!wo) {
      return res.status(404).json({ message: "Work order not found" });
    }

    const st = String(wo.status || "").toUpperCase();
    if (["COMPLETED", "CANCELED", "CANCELLED"].includes(st)) {
      return res.status(409).json({
        message: `Work order is ${wo.status}. No issues allowed.`,
      });
    }

    const existingIssue = await prisma.inventory_issues.findFirst({
      where: {
        company_id: companyId,
        work_order_id: workOrderId,
      },
      select: {
        id: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    if (existingIssue) {
      return res.status(409).json({
        message: "Inventory issue already exists for this work order",
        issue_id: existingIssue.id,
      });
    }

    const issue = await prisma.inventory_issues.create({
      data: {
        company_id: companyId,
        maintenance_work_orders: {
          connect: { id: wo.id },
        },
        issued_by: userId,
        issued_at: now,
        created_at: now,
        notes: notes ? String(notes).trim() : null,
      },
    });

    return res.status(201).json({
      message: "Issue created",
      issue,
    });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("CREATE ISSUE ERROR:", e);
    return res.status(500).json({
      message: "Failed to create issue",
      error: e.message,
    });
  }
}

// POST /maintenance/issues/:issueId/lines
async function addIssueLines(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isAdminOrAccountant(req)) {
      return res.status(403).json({
        message: "Only ADMIN/ACCOUNTANT can add issue lines (for now)",
      });
    }

    const issueId = String(req.params.issueId || "");
    assertUuid(issueId, "issue id");

    const { lines } = req.body || {};
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: "lines[] is required" });
    }

    const issue = await prisma.inventory_issues.findFirst({
      where: {
        id: issueId,
        company_id: companyId,
      },
      select: {
        id: true,
        company_id: true,
        work_order_id: true,
      },
    });

    if (!issue) {
      return res.status(404).json({ message: "Issue not found" });
    }

    const workOrder = await prisma.maintenance_work_orders.findFirst({
      where: {
        id: issue.work_order_id,
        company_id: companyId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!workOrder) {
      return res.status(404).json({ message: "Work order not found" });
    }

    const workOrderStatus = String(workOrder.status || "").toUpperCase();
    if (["COMPLETED", "CANCELED", "CANCELLED"].includes(workOrderStatus)) {
      return res.status(409).json({
        message: `Work order is ${workOrder.status}. No issue lines allowed.`,
      });
    }

    const payload = [];
    for (const [idx, l] of lines.entries()) {
      const part_id = String(l?.part_id || "").trim();
      const qty = Number(l?.qty);
      const unit_cost = Number(l?.unit_cost);

      assertUuid(part_id, `lines[${idx}].part_id`);

      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({
          message: `lines[${idx}].qty must be > 0`,
        });
      }

      if (!Number.isFinite(unit_cost) || unit_cost < 0) {
        return res.status(400).json({
          message: `lines[${idx}].unit_cost must be >= 0`,
        });
      }

      const total_cost = qty * unit_cost;

      payload.push({
        company_id: companyId,
        issue_id: issueId,
        part_id,
        qty,
        unit_cost,
        total_cost,
        notes: l?.notes ? String(l.notes).trim() : null,
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
      return Promise.all(
        payload.map((p) =>
          tx.inventory_issue_lines.create({
            data: {
              company_id: companyId,
              issue_id: p.issue_id,
              part_id: p.part_id,
              qty: p.qty,
              unit_cost: p.unit_cost,
              total_cost: p.total_cost,
              notes: p.notes,
            },
          })
        )
      );
    });

    return res.status(201).json({
      message: "Lines added",
      lines: created,
    });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("ADD ISSUE LINES ERROR:", e);
    return res.status(500).json({
      message: "Failed to add lines",
      error: e.message,
    });
  }
}

module.exports = {
  createIssueForWorkOrder,
  addIssueLines,
};