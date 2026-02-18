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

/**
 * Helpers
 */
function safeInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
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
        reservations: {
          include: {
            part_items: { include: { parts: true, warehouses: true } },
          },
        },
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
        reservations: {
          include: {
            part_items: { include: { parts: true, warehouses: true } },
          },
        },
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
    if (work_order_id && !isUuid(work_order_id)) {
      return res.status(400).json({ message: "work_order_id invalid" });
    }
    if (!lines.length) return res.status(400).json({ message: "lines is required" });

    for (const [i, ln] of lines.entries()) {
      const part_id = String(ln?.part_id || "").trim();
      const needed_qty = safeInt(ln?.needed_qty);

      if (!isUuid(part_id)) return res.status(400).json({ message: `lines[${i}].part_id invalid` });
      if (needed_qty == null || needed_qty <= 0) {
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
            needed_qty: safeInt(ln.needed_qty),
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

/**
 * approveRequest (Enterprise):
 * - validates request is PENDING
 * - reserves actual serial units: IN_STOCK -> RESERVED
 * - inserts inventory_request_reservations rows for each reserved serial
 * - then marks request APPROVED
 *
 * FIFO by received_at asc
 */
async function approveRequest(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.inventory_requests.findUnique({
        where: { id },
        include: { lines: true, reservations: true },
      });

      if (!request) {
        const e = new Error("Request not found");
        e.statusCode = 404;
        throw e;
      }

      if (request.status !== "PENDING") {
        const e = new Error("Only PENDING requests can be approved");
        e.statusCode = 400;
        throw e;
      }

      if (!request.warehouse_id) {
        const e = new Error("Request missing warehouse_id");
        e.statusCode = 400;
        throw e;
      }

      if (!request.lines || request.lines.length === 0) {
        const e = new Error("Request has no lines");
        e.statusCode = 400;
        throw e;
      }

      // Safety: should have no reservations while PENDING
      if (request.reservations && request.reservations.length > 0) {
        const e = new Error("Request already has reservations");
        e.statusCode = 409;
        throw e;
      }

      const reservedByLine = [];

      for (const ln of request.lines) {
        const partId = ln.part_id;
        const qty = safeInt(ln.needed_qty);

        if (!isUuid(partId) || qty == null || qty <= 0) {
          const e = new Error("Invalid request lines");
          e.statusCode = 400;
          throw e;
        }

        // pick FIFO: IN_STOCK only
        const picked = await tx.part_items.findMany({
          where: {
            warehouse_id: request.warehouse_id,
            part_id: partId,
            status: "IN_STOCK",
          },
          orderBy: { received_at: "asc" },
          take: qty,
          select: {
            id: true,
            internal_serial: true,
            manufacturer_serial: true,
            status: true,
            part_id: true,
            warehouse_id: true,
          },
        });

        if (picked.length < qty) {
          const e = new Error(
            `Insufficient stock for part_id=${partId}. Needed ${qty}, available ${picked.length}.`
          );
          e.statusCode = 409;
          throw e;
        }

        const ids = picked.map((p) => p.id);

        // update with race safety
        const upd = await tx.part_items.updateMany({
          where: { id: { in: ids }, status: "IN_STOCK" },
          data: { status: "RESERVED", last_moved_at: new Date() },
        });

        if (upd.count !== ids.length) {
          const e = new Error("Stock changed while approving. Please retry.");
          e.statusCode = 409;
          throw e;
        }

        // create reservations rows (request_id + part_item_id should be unique in DB ideally)
        await tx.inventory_request_reservations.createMany({
          data: ids.map((part_item_id) => ({
            request_id: request.id,
            part_item_id,
          })),
        });

        reservedByLine.push({
          request_line_id: ln.id,
          part_id: partId,
          reserved_qty: ids.length,
          reserved_items: picked,
        });
      }

      // mark request APPROVED
      const updated = await tx.inventory_requests.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
          // لو عندك أعمدة approved_by / approved_at في DB أضفهم هنا
          // approved_by: userId,
          // approved_at: new Date(),
        },
        include: {
          warehouses: true,
          lines: { include: { parts: true } },
          reservations: {
            include: {
              part_items: { include: { parts: true, warehouses: true } },
            },
          },
        },
      });

      return { updated, reservedByLine };
    });

    res.json({
      message: "Request approved and stock reserved",
      request: result.updated,
      reserved: result.reservedByLine,
    });
  } catch (err) {
    const sc = err?.statusCode || 500;
    if (sc !== 500) return res.status(sc).json({ message: String(err.message || "Error") });

    console.error("approveRequest error:", err);
    res.status(500).json({ message: "Failed to approve request" });
  }
}

/**
 * unreserveRequest (Enterprise):
 * - Only APPROVED requests
 * - Uses reservations table to find reserved part_items
 * - Returns them RESERVED -> IN_STOCK
 * - Deletes reservation rows
 * - Moves request back to PENDING
 */
async function unreserveRequest(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.inventory_requests.findUnique({
        where: { id },
        include: { reservations: true },
      });

      if (!request) {
        const e = new Error("Request not found");
        e.statusCode = 404;
        throw e;
      }

      if (request.status !== "APPROVED") {
        const e = new Error("Only APPROVED requests can be unreserved");
        e.statusCode = 400;
        throw e;
      }

      const resRows = request.reservations || [];
      const partItemIds = resRows.map((r) => r.part_item_id);

      if (partItemIds.length) {
        // flip only those still RESERVED
        await tx.part_items.updateMany({
          where: { id: { in: partItemIds }, status: "RESERVED" },
          data: { status: "IN_STOCK", last_moved_at: new Date() },
        });

        await tx.inventory_request_reservations.deleteMany({
          where: { request_id: request.id },
        });
      }

      const updatedReq = await tx.inventory_requests.update({
        where: { id: request.id },
        data: { status: "PENDING" },
      });

      return { updatedReq, unreserved_count: partItemIds.length };
    });

    res.json({
      message: "Unreserved stock and moved request back to PENDING",
      request: result.updatedReq,
      unreserved_count: result.unreserved_count,
    });
  } catch (err) {
    const sc = err?.statusCode || 500;
    if (sc !== 500) return res.status(sc).json({ message: String(err.message || "Error") });

    console.error("unreserveRequest error:", err);
    res.status(500).json({ message: "Failed to unreserve request" });
  }
}

/**
 * rejectRequest (Enterprise):
 * - Allows rejecting PENDING or APPROVED
 * - If APPROVED => auto-unreserve first
 * - Then sets REJECTED + appends reason in notes
 */
async function rejectRequest(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const reason = req.body?.reason != null ? String(req.body.reason).trim() : null;

    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.inventory_requests.findUnique({
        where: { id },
        include: { reservations: true },
      });

      if (!row) {
        const e = new Error("Request not found");
        e.statusCode = 404;
        throw e;
      }

      if (row.status === "APPROVED") {
        const partItemIds = (row.reservations || []).map((r) => r.part_item_id);

        if (partItemIds.length) {
          await tx.part_items.updateMany({
            where: { id: { in: partItemIds }, status: "RESERVED" },
            data: { status: "IN_STOCK", last_moved_at: new Date() },
          });

          await tx.inventory_request_reservations.deleteMany({
            where: { request_id: row.id },
          });
        }
      } else if (row.status !== "PENDING") {
        const e = new Error("Only PENDING/APPROVED requests can be rejected");
        e.statusCode = 400;
        throw e;
      }

      const updated = await tx.inventory_requests.update({
        where: { id: row.id },
        data: {
          status: "REJECTED",
          notes: reason
            ? row.notes
              ? `${row.notes}\nREJECT_REASON: ${reason}`
              : `REJECT_REASON: ${reason}`
            : row.notes,
        },
      });

      return updated;
    });

    res.json(result);
  } catch (err) {
    const sc = err?.statusCode || 500;
    if (sc !== 500) return res.status(sc).json({ message: String(err.message || "Error") });

    console.error("rejectRequest error:", err);
    res.status(500).json({ message: "Failed to reject request" });
  }
}

module.exports = {
  listRequests,
  getRequest,
  createRequest,
  approveRequest,
  unreserveRequest,
  rejectRequest,
};
