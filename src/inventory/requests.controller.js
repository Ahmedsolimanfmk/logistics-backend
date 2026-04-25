// =======================
// src/inventory/requests.controller.js
// Supports SERIAL + BULK stock
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

function safeInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function buildError(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function requireCompanyId(companyId) {
  if (!companyId || !isUuid(companyId)) {
    throw buildError("Invalid company context", 400);
  }
  return companyId;
}

async function assertWarehouseBelongsToCompany(tx, companyId, warehouseId) {
  const row = await tx.warehouses.findFirst({
    where: {
      id: warehouseId,
      company_id: companyId,
    },
    select: { id: true, company_id: true, is_active: true, name: true },
  });

  if (!row) throw buildError("Warehouse not found", 404);
  return row;
}

async function assertPartsBelongToCompany(tx, companyId, partIds) {
  const uniqueIds = Array.from(new Set((partIds || []).filter(Boolean)));
  if (!uniqueIds.length) return;

  const rows = await tx.parts.findMany({
    where: {
      company_id: companyId,
      id: { in: uniqueIds },
    },
    select: { id: true },
  });

  if (rows.length !== uniqueIds.length) {
    throw buildError("One or more parts not found", 404);
  }
}

function requestInclude() {
  return {
    warehouse: true,
    lines: {
      include: {
        part: true,
      },
    },
    issues: true,
    reservations: {
      include: {
        part_item: {
          include: {
            part: true,
            warehouse: true,
          },
        },
      },
    },
  };
}

// =======================
// LIST
// =======================
async function listRequests(req, res) {
  try {
    const companyId = requireCompanyId(req.companyId);

    const status = String(req.query.status || "").trim();
    const warehouse_id = String(req.query.warehouse_id || "").trim();
    const work_order_id = String(req.query.work_order_id || "").trim();

    if (warehouse_id && !isUuid(warehouse_id)) {
      return res.status(400).json({ message: "warehouse_id invalid" });
    }

    if (work_order_id && !isUuid(work_order_id)) {
      return res.status(400).json({ message: "work_order_id invalid" });
    }

    const where = {
      company_id: companyId,
    };

    if (status && status.toUpperCase() !== "ALL") where.status = status;
    if (warehouse_id) where.warehouse_id = warehouse_id;
    if (work_order_id) where.work_order_id = work_order_id;

    const rows = await prisma.inventory_requests.findMany({
      where,
      orderBy: [{ created_at: "desc" }],
      include: requestInclude(),
      take: 200,
    });

    return res.json({ items: rows });
  } catch (err) {
    console.error("listRequests error:", err);
    return res.status(err?.statusCode || 500).json({
      message: err?.message || "Failed to list requests",
    });
  }
}

// =======================
// GET ONE
// =======================
async function getRequest(req, res) {
  try {
    const companyId = requireCompanyId(req.companyId);
    const id = String(req.params.id || "").trim();

    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const row = await prisma.inventory_requests.findFirst({
      where: {
        id,
        company_id: companyId,
      },
      include: requestInclude(),
    });

    if (!row) return res.status(404).json({ message: "Request not found" });

    return res.json(row);
  } catch (err) {
    console.error("getRequest error:", err);
    return res.status(err?.statusCode || 500).json({
      message: err?.message || "Failed to get request",
    });
  }
}

// =======================
// CREATE
// =======================
async function createRequest(req, res) {
  try {
    const companyId = requireCompanyId(req.companyId);
    const requested_by = getAuthUserId(req);

    const warehouse_id = String(req.body?.warehouse_id || "").trim();
    const work_order_id =
      req.body?.work_order_id != null && String(req.body.work_order_id).trim()
        ? String(req.body.work_order_id).trim()
        : null;

    const notes = req.body?.notes != null ? String(req.body.notes).trim() : null;
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];

    if (!requested_by) return res.status(401).json({ message: "Unauthorized" });

    if (!isUuid(warehouse_id)) {
      return res.status(400).json({ message: "warehouse_id is required" });
    }

    if (work_order_id && !isUuid(work_order_id)) {
      return res.status(400).json({ message: "work_order_id invalid" });
    }

    if (!lines.length) {
      return res.status(400).json({ message: "lines is required" });
    }

    for (const [i, ln] of lines.entries()) {
      const part_id = String(ln?.part_id || "").trim();
      const needed_qty = safeInt(ln?.needed_qty);

      if (!isUuid(part_id)) {
        return res.status(400).json({ message: `lines[${i}].part_id invalid` });
      }

      if (needed_qty == null || needed_qty <= 0) {
        return res.status(400).json({
          message: `lines[${i}].needed_qty must be > 0`,
        });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      await assertWarehouseBelongsToCompany(tx, companyId, warehouse_id);

      await assertPartsBelongToCompany(
        tx,
        companyId,
        lines.map((ln) => String(ln.part_id).trim())
      );

      return tx.inventory_requests.create({
        data: {
          company_id: companyId,
          warehouse_id,
          work_order_id,
          requested_by,
          status: "PENDING",
          notes,
          lines: {
            create: lines.map((ln) => ({
              company_id: companyId,
              part_id: String(ln.part_id).trim(),
              needed_qty: safeInt(ln.needed_qty),
              notes: ln?.notes != null ? String(ln.notes).trim() : null,
            })),
          },
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
    });

    return res.status(201).json(created);
  } catch (err) {
    console.error("createRequest error:", err);
    return res.status(err?.statusCode || 500).json({
      message: err?.message || "Failed to create request",
    });
  }
}

// =======================
// APPROVE
// Serial: part_items -> ISSUED
// Bulk: warehouse_parts qty_on_hand decrement
// Creates inventory_issue + inventory_issue_lines
// =======================
async function approveRequest(req, res) {
  try {
    const companyId = requireCompanyId(req.companyId);
    const id = String(req.params.id || "").trim();

    if (!isUuid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }

    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.inventory_requests.findFirst({
        where: {
          id,
          company_id: companyId,
        },
        include: {
          lines: {
            include: {
              part: true,
            },
          },
          reservations: true,
        },
      });

      if (!request) throw buildError("Request not found", 404);

      if (request.status !== "PENDING") {
        throw buildError("Only PENDING requests can be approved", 400);
      }

      if (!request.warehouse_id) {
        throw buildError("Request missing warehouse_id", 400);
      }

      if (!request.lines || request.lines.length === 0) {
        throw buildError("Request has no lines", 400);
      }

      if (request.reservations && request.reservations.length > 0) {
        throw buildError("Request already has reservations", 409);
      }

      await assertWarehouseBelongsToCompany(tx, companyId, request.warehouse_id);

      const now = new Date();

      const issue = await tx.inventory_issues.create({
  data: {
    company_id: companyId,
    warehouse_id: request.warehouse_id,
    request_id: request.id,
    work_order_id: request.work_order_id || null,
    status: "POSTED",
    issued_by: userId,
    approved_by: userId,
    approved_at: now,
    issued_at: now,
    reference_no: `WO-${String(request.work_order_id || request.id).slice(0, 8)}`,
    notes: "Auto issued from approved inventory request",
  },
});

      const reservedByLine = [];
      const issueLinesCreated = [];

      for (const ln of request.lines) {
        const partId = String(ln.part_id || "").trim();
        const qty = safeInt(ln.needed_qty);

        if (!isUuid(partId) || qty == null || qty <= 0) {
          throw buildError("Invalid request lines", 400);
        }

        // ======================
        // 1) SERIAL stock
        // ======================
        const serialItems = await tx.part_items.findMany({
          where: {
            company_id: companyId,
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

        if (serialItems.length >= qty) {
          const picked = serialItems.slice(0, qty);
          const ids = picked.map((p) => p.id);

          const upd = await tx.part_items.updateMany({
            where: {
              company_id: companyId,
              id: { in: ids },
              status: "IN_STOCK",
            },
            data: {
              status: "ISSUED",
              last_moved_at: now,
            },
          });

          if (upd.count !== ids.length) {
            throw buildError("Stock changed while approving. Please retry.", 409);
          }

          await tx.inventory_request_reservations.createMany({
            data: ids.map((part_item_id) => ({
              company_id: companyId,
              request_id: request.id,
              part_item_id,
            })),
          });

          const createdLines = await Promise.all(
            picked.map((item) =>
              tx.inventory_issue_lines.create({
                data: {
                  company_id: companyId,
                  issue_id: issue.id,
                  part_id: partId,
                  part_item_id: item.id,
                  qty: 1,
                  unit_cost: null,
                  total_cost: null,
                  notes: ln.notes || null,
                },
              })
            )
          );

          issueLinesCreated.push(...createdLines);

          reservedByLine.push({
            request_line_id: ln.id,
            part_id: partId,
            mode: "SERIAL",
            reserved_qty: ids.length,
            issued_qty: ids.length,
            reserved_items: picked,
          });

          continue;
        }

        // ======================
        // 2) BULK stock
        // ======================
        const stock = await tx.warehouse_parts.findFirst({
          where: {
            company_id: companyId,
            warehouse_id: request.warehouse_id,
            part_id: partId,
          },
          select: {
            id: true,
            qty_on_hand: true,
          },
        });

        const available = Number(stock?.qty_on_hand || 0);

        if (!stock || available < qty) {
          throw buildError(
            `Insufficient stock for part_id=${partId}. Needed ${qty}, available ${available}.`,
            409
          );
        }

        const bulkUpd = await tx.warehouse_parts.updateMany({
          where: {
            id: stock.id,
            company_id: companyId,
            qty_on_hand: {
              gte: qty,
            },
          },
          data: {
            qty_on_hand: {
              decrement: qty,
            },
          },
        });

        if (bulkUpd.count !== 1) {
          throw buildError("Stock changed while approving. Please retry.", 409);
        }

        const createdLine = await tx.inventory_issue_lines.create({
          data: {
            company_id: companyId,
            issue_id: issue.id,
            part_id: partId,
            part_item_id: null,
            qty,
            unit_cost: null,
            total_cost: null,
            notes: ln.notes || null,
          },
        });

        issueLinesCreated.push(createdLine);

        reservedByLine.push({
          request_line_id: ln.id,
          part_id: partId,
          mode: "BULK",
          reserved_qty: qty,
          issued_qty: qty,
          available_before: available,
          available_after: available - qty,
        });
      }

      const updated = await tx.inventory_requests.update({
        where: { id: request.id },
        data: {
          status: "APPROVED",
        },
        include: requestInclude(),
      });

      return {
        updated,
        issue,
        issue_lines: issueLinesCreated,
        reservedByLine,
      };
    });

    return res.json({
      message: "Request approved and stock issued",
      request: result.updated,
      issue: result.issue,
      issue_lines: result.issue_lines,
      reserved: result.reservedByLine,
    });
  } catch (err) {
    const sc = err?.statusCode || 500;

    if (sc !== 500) {
      return res.status(sc).json({ message: String(err.message || "Error") });
    }

    console.error("approveRequest error:", err);
    return res.status(500).json({
      message: "Failed to approve request",
      error: err?.message || String(err),
      code: err?.code,
      meta: err?.meta,
    });
  }
}

// =======================
// UNRESERVE
// =======================
async function unreserveRequest(req, res) {
  try {
    const companyId = requireCompanyId(req.companyId);
    const id = String(req.params.id || "").trim();

    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.inventory_requests.findFirst({
        where: {
          id,
          company_id: companyId,
        },
        include: { reservations: true },
      });

      if (!request) throw buildError("Request not found", 404);

      if (request.status !== "APPROVED") {
        throw buildError("Only APPROVED requests can be unreserved", 400);
      }

      const resRows = request.reservations || [];
      const partItemIds = resRows.map((r) => r.part_item_id).filter(Boolean);

      if (partItemIds.length) {
        await tx.part_items.updateMany({
          where: {
            company_id: companyId,
            id: { in: partItemIds },
            status: "RESERVED",
          },
          data: {
            status: "IN_STOCK",
            last_moved_at: new Date(),
          },
        });

        await tx.inventory_request_reservations.deleteMany({
          where: {
            company_id: companyId,
            request_id: request.id,
          },
        });
      }

      const updatedReq = await tx.inventory_requests.update({
        where: { id: request.id },
        data: { status: "PENDING" },
        include: requestInclude(),
      });

      return { updatedReq, unreserved_count: partItemIds.length };
    });

    return res.json({
      message: "Unreserved stock and moved request back to PENDING",
      request: result.updatedReq,
      unreserved_count: result.unreserved_count,
    });
  } catch (err) {
    const sc = err?.statusCode || 500;

    if (sc !== 500) {
      return res.status(sc).json({ message: String(err.message || "Error") });
    }

    console.error("unreserveRequest error:", err);
    return res.status(500).json({ message: "Failed to unreserve request" });
  }
}

// =======================
// REJECT
// =======================
async function rejectRequest(req, res) {
  try {
    const companyId = requireCompanyId(req.companyId);
    const id = String(req.params.id || "").trim();

    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const reason =
      req.body?.reason != null ? String(req.body.reason).trim() : null;

    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.inventory_requests.findFirst({
        where: {
          id,
          company_id: companyId,
        },
        include: { reservations: true },
      });

      if (!row) throw buildError("Request not found", 404);

      if (row.status === "APPROVED") {
        throw buildError("Approved requests already issued. Cannot reject.", 409);
      }

      if (row.status !== "PENDING") {
        throw buildError("Only PENDING requests can be rejected", 400);
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
        include: requestInclude(),
      });

      return updated;
    });

    return res.json(result);
  } catch (err) {
    const sc = err?.statusCode || 500;

    if (sc !== 500) {
      return res.status(sc).json({ message: String(err.message || "Error") });
    }

    console.error("rejectRequest error:", err);
    return res.status(500).json({ message: "Failed to reject request" });
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