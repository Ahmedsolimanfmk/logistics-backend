// =======================
// src/inventory/requests.controller.js
// =======================

const prisma = require("../maintenance/prisma");

function getAuthUserId(req) {
  return req?.user?.sub || req?.user?.id || req?.user?.userId || null;
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

async function listRequests(req, res) {
  try {
    const status = String(req.query.status || "").trim();
    const warehouse_id = String(req.query.warehouse_id || "").trim();
    const work_order_id = String(req.query.work_order_id || "").trim();

    const where = {};
    if (status) where.status = status;
    if (warehouse_id) where.warehouse_id = warehouse_id;
    if (work_order_id) where.work_order_id = work_order_id;

    const rows = await prisma.inventory_requests.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: [{ created_at: "desc" }],
      include: {
        warehouses: true,
        lines: { include: { parts: true } },
      },
    });

    res.json({ items: rows });
  } catch (err) {
    console.error("listRequests error:", err);
    res.status(500).json({ message: "Failed to list requests" });
  }
}

async function getRequest(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const row = await prisma.inventory_requests.findUnique({
      where: { id },
      include: {
        warehouses: true,
        lines: { include: { parts: true } },
        issues: true,
      },
    });

    if (!row) return res.status(404).json({ message: "Request not found" });
    res.json(row);
  } catch (err) {
    console.error("getRequest error:", err);
    res.status(500).json({ message: "Failed to get request" });
  }
}

async function createRequest(req, res) {
  try {
    const requested_by = getAuthUserId(req);

    const warehouse_id = String(req.body?.warehouse_id || "").trim();
    const work_order_id =
      req.body?.work_order_id != null && String(req.body.work_order_id).trim()
        ? String(req.body.work_order_id).trim()
        : null;

    const notes = req.body?.notes != null ? String(req.body.notes).trim() : null;
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];

    if (!requested_by) return res.status(401).json({ message: "Unauthorized" });
    if (!isUuid(warehouse_id)) return res.status(400).json({ message: "warehouse_id is required" });
    if (work_order_id && !isUuid(work_order_id)) return res.status(400).json({ message: "work_order_id invalid" });
    if (!lines.length) return res.status(400).json({ message: "lines is required" });

    for (const [i, ln] of lines.entries()) {
      const part_id = String(ln?.part_id || "").trim();
      const needed_qty = Number(ln?.needed_qty);

      if (!isUuid(part_id)) return res.status(400).json({ message: `lines[${i}].part_id invalid` });
      if (!Number.isFinite(needed_qty) || needed_qty <= 0) {
        return res.status(400).json({ message: `lines[${i}].needed_qty must be > 0` });
      }
    }

    const created = await prisma.inventory_requests.create({
      data: {
        warehouse_id,
        work_order_id,
        requested_by,
        status: "PENDING",
        notes,
        lines: {
          create: lines.map((ln) => ({
            part_id: String(ln.part_id).trim(),
            needed_qty: Math.floor(Number(ln.needed_qty)),
            notes: ln?.notes != null ? String(ln.notes).trim() : null,
          })),
        },
      },
      include: { lines: true },
    });

    res.status(201).json(created);
  } catch (err) {
    console.error("createRequest error:", err);
    res.status(500).json({ message: "Failed to create request" });
  }
}

async function approveRequest(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const row = await prisma.inventory_requests.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ message: "Request not found" });

    if (row.status !== "PENDING") {
      return res.status(400).json({ message: "Only PENDING requests can be approved" });
    }

    const updated = await prisma.inventory_requests.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    res.json(updated);
  } catch (err) {
    console.error("approveRequest error:", err);
    res.status(500).json({ message: "Failed to approve request" });
  }
}

async function rejectRequest(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const reason = req.body?.reason != null ? String(req.body.reason).trim() : null;

    const row = await prisma.inventory_requests.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ message: "Request not found" });

    if (row.status !== "PENDING") {
      return res.status(400).json({ message: "Only PENDING requests can be rejected" });
    }

    const updated = await prisma.inventory_requests.update({
      where: { id },
      data: {
        status: "REJECTED",
        notes: reason ? (row.notes ? `${row.notes}\nREJECT_REASON: ${reason}` : `REJECT_REASON: ${reason}`) : row.notes,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error("rejectRequest error:", err);
    res.status(500).json({ message: "Failed to reject request" });
  }
}

module.exports = {
  listRequests,
  getRequest,
  createRequest,
  approveRequest,
  rejectRequest,
};
