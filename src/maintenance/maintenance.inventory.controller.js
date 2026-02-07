// =======================
// src/maintenance/maintenance.inventory.controller.js
// =======================

const prisma = require("./prisma");

function getAuthUserId(req) {
  return req?.user?.sub || req?.user?.id || req?.user?.userId || null;
}

function roleUpper(role) {
  return String(role || "").toUpperCase();
}

function isAdminOrAccountant(role) {
  return ["ADMIN", "ACCOUNTANT"].includes(roleUpper(role));
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

// POST /maintenance/work-orders/:id/issues
// body: { notes? }
async function createIssueForWorkOrder(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = req.user?.role || null;
    if (!isAdminOrAccountant(role)) {
      return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can create issues (for now)" });
    }

    const workOrderId = req.params.id;
    if (!isUuid(workOrderId)) return res.status(400).json({ message: "Invalid work order id" });

    const { notes } = req.body || {};
    const now = new Date();

    const wo = await prisma.maintenance_work_orders.findUnique({
      where: { id: workOrderId },
      select: { id: true, vehicle_id: true, status: true },
    });

    if (!wo) return res.status(404).json({ message: "Work order not found" });

    const st = String(wo.status || "").toUpperCase();
    if (["COMPLETED", "CANCELED"].includes(st)) {
      return res.status(409).json({ message: `Work order is ${wo.status}. No issues allowed.` });
    }

    // ✅ inventory_issues schema عندك:
    // id, work_order_id, created_at, issued_at, issued_by, notes
    const issue = await prisma.inventory_issues.create({
      data: {
        // ربط بالـ Work Order (Relation required)
        maintenance_work_orders: {
          connect: { id: wo.id },
        },

        // حقول مطلوبة (NOT NULL)
        issued_by: userId,
        issued_at: now,
        created_at: now,

        notes: notes ? String(notes).trim() : null,
      },
    });

    return res.status(201).json({ message: "Issue created", issue });
  } catch (e) {
    console.log("CREATE ISSUE ERROR:", e);
    return res.status(500).json({ message: "Failed to create issue", error: e.message });
  }
}

// POST /maintenance/issues/:issueId/lines
// body: { lines: [{ part_id, qty, unit_cost, notes? }] }
async function addIssueLines(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = req.user?.role || null;
    if (!isAdminOrAccountant(role)) {
      return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can add issue lines (for now)" });
    }

    const issueId = req.params.issueId;
    if (!isUuid(issueId)) return res.status(400).json({ message: "Invalid issue id" });

    const { lines } = req.body || {};
    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ message: "lines[] is required" });
    }

    const issue = await prisma.inventory_issues.findUnique({
      where: { id: issueId },
      select: { id: true },
    });
    if (!issue) return res.status(404).json({ message: "Issue not found" });

    // ✅ inventory_issue_lines schema عندك:
    // id, issue_id, part_id, qty, unit_cost, total_cost, notes, created_at
    const payload = [];
    for (const [idx, l] of lines.entries()) {
      const part_id = l?.part_id;
      const qty = Number(l?.qty);
      const unit_cost = Number(l?.unit_cost);

      if (!isUuid(part_id)) {
        return res.status(400).json({ message: `lines[${idx}].part_id must be uuid` });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ message: `lines[${idx}].qty must be > 0` });
      }
      if (!Number.isFinite(unit_cost) || unit_cost < 0) {
        return res.status(400).json({ message: `lines[${idx}].unit_cost must be >= 0` });
      }

      const total_cost = qty * unit_cost;

      payload.push({
        issue_id: issueId,
        part_id,
        qty,
        unit_cost,
        total_cost,
        notes: l?.notes ? String(l.notes).trim() : null,
      });
    }

    // ensure parts exist
    const partIds = [...new Set(payload.map((p) => p.part_id))];
    const parts = await prisma.parts.findMany({
      where: { id: { in: partIds } },
      select: { id: true },
    });
    if (parts.length !== partIds.length) {
      return res.status(400).json({ message: "One or more part_id not found" });
    }

    const now = new Date();
    const created = await prisma.$transaction(async (tx) => {
      const inserted = await Promise.all(
        payload.map((p) =>
          tx.inventory_issue_lines.create({
            data: {
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

      return inserted;
    });

    return res.status(201).json({ message: "Lines added", lines: created });
  } catch (e) {
    console.log("ADD ISSUE LINES ERROR:", e);
    return res.status(500).json({ message: "Failed to add lines", error: e.message });
  }
}

module.exports = {
  createIssueForWorkOrder,
  addIssueLines,
};
