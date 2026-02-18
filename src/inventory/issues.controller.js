// =======================
// src/inventory/issues.controller.js
// =======================

const prisma = require("../maintenance/prisma");
const { ROLES } = require("../auth/roles");
 // عدّل المسار لو مختلف عندك

function getAuthUserId(req) {
  return req?.user?.sub || req?.user?.id || req?.user?.userId || null;
}

function getAuthUserRole(req) {
  return req?.user?.role || null;
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function isPrismaModelMissing(err) {
  // Prisma sometimes throws "Unknown arg" or "Invalid prisma.<model>" etc.
  // Here we only want to detect "inventory_request_reservations model doesn't exist"
  const msg = String(err?.message || "");
  return (
    msg.includes("inventory_request_reservations") &&
    (msg.includes("is not a function") ||
      msg.includes("Unknown arg") ||
      msg.includes("Unknown field") ||
      msg.includes("does not exist") ||
      msg.includes("Invalid `prisma."))
  );
}

async function listIssues(req, res) {
  try {
    const status = String(req.query.status || "").trim(); // DRAFT/POSTED/CANCELLED
    const warehouse_id = String(req.query.warehouse_id || "").trim();
    const request_id = String(req.query.request_id || "").trim();
    const work_order_id = String(req.query.work_order_id || "").trim();

    const where = {};
    if (status) where.status = status;
    if (warehouse_id) where.warehouse_id = warehouse_id;
    if (request_id) where.request_id = request_id;
    if (work_order_id) where.work_order_id = work_order_id;

    const rows = await prisma.inventory_issues.findMany({
      where: Object.keys(where).length ? where : undefined,
      orderBy: [{ created_at: "desc" }],
      include: {
        warehouses: true,
        requests: true,
        inventory_issue_lines: { include: { parts: true, part_items: true } },
      },
    });

    res.json({ items: rows });
  } catch (err) {
    console.error("listIssues error:", err);
    res.status(500).json({ message: "Failed to list issues" });
  }
}

async function getIssue(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });

    const row = await prisma.inventory_issues.findUnique({
      where: { id },
      include: {
        warehouses: true,
        requests: true,
        inventory_issue_lines: { include: { parts: true, part_items: true } },
      },
    });

    if (!row) return res.status(404).json({ message: "Issue not found" });
    res.json(row);
  } catch (err) {
    console.error("getIssue error:", err);
    res.status(500).json({ message: "Failed to get issue" });
  }
}

async function createIssueDraft(req, res) {
  try {
    const issued_by = getAuthUserId(req);
    const userRole = getAuthUserRole(req);

    const warehouse_id = String(req.body?.warehouse_id || "").trim();
    const work_order_id = String(req.body?.work_order_id || "").trim();
    const request_id =
      req.body?.request_id != null && String(req.body.request_id).trim()
        ? String(req.body.request_id).trim()
        : null;

    const notes = req.body?.notes != null ? String(req.body.notes).trim() : null;
    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];

    if (!issued_by) return res.status(401).json({ message: "Unauthorized" });
    if (!isUuid(warehouse_id)) return res.status(400).json({ message: "warehouse_id is required" });
    if (!isUuid(work_order_id)) return res.status(400).json({ message: "work_order_id is required" });
    if (request_id && !isUuid(request_id)) return res.status(400).json({ message: "request_id invalid" });
    if (!lines.length) return res.status(400).json({ message: "lines is required" });

    // Direct issue must have reason + role allowed
    if (!request_id) {
      if (![ROLES.ADMIN, ROLES.STOREKEEPER].includes(userRole)) {
        return res.status(403).json({ message: "Direct issue allowed only for ADMIN or STOREKEEPER" });
      }
      if (!notes || notes.length < 5) {
        return res.status(400).json({ message: "Direct issue requires reason in notes" });
      }
    }

    for (const [i, ln] of lines.entries()) {
      const part_id = String(ln?.part_id || "").trim();
      const part_item_id = String(ln?.part_item_id || "").trim();
      const qty = ln?.qty == null ? 1 : Number(ln.qty);

      if (!isUuid(part_id)) return res.status(400).json({ message: `lines[${i}].part_id invalid` });
      if (!isUuid(part_item_id)) {
        return res
          .status(400)
          .json({ message: `lines[${i}].part_item_id invalid (serial required)` });
      }
      if (!Number.isFinite(qty) || qty !== 1) {
        return res.status(400).json({ message: `lines[${i}].qty must be 1 for serial items` });
      }
    }

    // If request-based: request must be APPROVED + (optional) reservation checks
    if (request_id) {
      const reqRow = await prisma.inventory_requests.findUnique({
        where: { id: request_id },
        select: { id: true, status: true, warehouse_id: true, work_order_id: true },
      });

      if (!reqRow) return res.status(404).json({ message: "Request not found" });
      if (reqRow.status !== "APPROVED") {
        return res.status(400).json({ message: "Request must be APPROVED before issuing" });
      }
      if (String(reqRow.warehouse_id) !== warehouse_id) {
        return res.status(400).json({ message: "Issue warehouse_id must match request warehouse_id" });
      }
      if (reqRow.work_order_id && String(reqRow.work_order_id) !== work_order_id) {
        return res.status(400).json({ message: "work_order_id must match request work_order_id" });
      }

      // Ensure each part_item is RESERVED in that warehouse and matches part_id
      const partItemIds = lines.map((ln) => String(ln.part_item_id).trim());
      const partItems = await prisma.part_items.findMany({
        where: { id: { in: partItemIds } },
        select: { id: true, status: true, warehouse_id: true, part_id: true },
      });

      const map = new Map(partItems.map((p) => [p.id, p]));
      for (const [i, ln] of lines.entries()) {
        const part_id = String(ln.part_id).trim();
        const part_item_id = String(ln.part_item_id).trim();
        const pi = map.get(part_item_id);

        if (!pi) return res.status(400).json({ message: `lines[${i}].part_item_id not found` });
        if (String(pi.warehouse_id) !== warehouse_id) {
          return res.status(400).json({ message: `lines[${i}].part_item_id not in this warehouse` });
        }
        if (String(pi.part_id) !== part_id) {
          return res.status(400).json({ message: `lines[${i}].part_item_id does not match part_id` });
        }
        if (pi.status !== "RESERVED") {
          return res.status(409).json({
            message: `lines[${i}].part_item_id must be RESERVED (current=${pi.status})`,
          });
        }
      }

      // Optional: verify reservations table if exists
      try {
        const reservations = await prisma.inventory_request_reservations.findMany({
          where: { request_id, part_item_id: { in: partItemIds } },
          select: { part_item_id: true },
        });

        const set = new Set(reservations.map((r) => r.part_item_id));
        for (const pid of partItemIds) {
          if (!set.has(pid)) {
            return res.status(409).json({
              message: `part_item_id is not reserved for this request: ${pid}`,
            });
          }
        }
      } catch (e) {
        // if model not present, ignore (system will still work using part_items.status RESERVED)
        if (!isPrismaModelMissing(e)) {
          console.error("reservations check error:", e);
          return res.status(500).json({ message: "Failed to validate reservations" });
        }
      }
    } else {
      // Direct: ensure IN_STOCK now (early feedback)
      const partItemIds = lines.map((ln) => String(ln.part_item_id).trim());
      const partItems = await prisma.part_items.findMany({
        where: { id: { in: partItemIds } },
        select: { id: true, status: true, warehouse_id: true, part_id: true },
      });

      const map = new Map(partItems.map((p) => [p.id, p]));
      for (const [i, ln] of lines.entries()) {
        const part_id = String(ln.part_id).trim();
        const part_item_id = String(ln.part_item_id).trim();
        const pi = map.get(part_item_id);

        if (!pi) return res.status(400).json({ message: `lines[${i}].part_item_id not found` });
        if (String(pi.warehouse_id) !== warehouse_id) {
          return res.status(400).json({ message: `lines[${i}].part_item_id not in this warehouse` });
        }
        if (String(pi.part_id) !== part_id) {
          return res.status(400).json({ message: `lines[${i}].part_item_id does not match part_id` });
        }
        if (pi.status !== "IN_STOCK") {
          return res.status(409).json({
            message: `lines[${i}].part_item_id must be IN_STOCK for direct issue (current=${pi.status})`,
          });
        }
      }
    }

    const created = await prisma.inventory_issues.create({
      data: {
        warehouse_id,
        work_order_id,
        request_id,
        issued_by,
        status: "DRAFT",
        notes,
        inventory_issue_lines: {
          create: lines.map((ln) => ({
            part_id: String(ln.part_id).trim(),
            part_item_id: String(ln.part_item_id).trim(),
            qty: 1,
            unit_cost: ln?.unit_cost == null || ln?.unit_cost === "" ? null : ln.unit_cost,
            total_cost: ln?.unit_cost == null || ln?.unit_cost === "" ? null : ln.unit_cost,
            notes: ln?.notes != null ? String(ln.notes).trim() : null,
          })),
        },
      },
      include: { inventory_issue_lines: true },
    });

    res.status(201).json(created);
  } catch (err) {
    console.error("createIssueDraft error:", err);
    res.status(500).json({ message: "Failed to create issue draft" });
  }
}

async function postIssue(req, res) {
  try {
    const userId = getAuthUserId(req);
    const userRole = getAuthUserRole(req);

    const id = String(req.params.id || "").trim();
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid id" });
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const result = await prisma.$transaction(async (tx) => {
      const issue = await tx.inventory_issues.findUnique({
        where: { id },
        include: { inventory_issue_lines: true },
      });

      if (!issue) {
        const e = new Error("Issue not found");
        e.statusCode = 404;
        throw e;
      }
      if (issue.status !== "DRAFT") {
        const e = new Error("Only DRAFT issues can be posted");
        e.statusCode = 400;
        throw e;
      }
      if (!issue.inventory_issue_lines.length) {
        const e = new Error("Issue has no lines");
        e.statusCode = 400;
        throw e;
      }
      if (!issue.warehouse_id) {
        const e = new Error("Issue missing warehouse_id");
        e.statusCode = 400;
        throw e;
      }

      const isRequestBased = !!issue.request_id;

      // Direct post permission + reason
      if (!isRequestBased) {
        if (![ROLES.ADMIN, ROLES.STOREKEEPER].includes(userRole)) {
          const e = new Error("Direct issue allowed only for ADMIN or STOREKEEPER");
          e.statusCode = 403;
          throw e;
        }
        if (!issue.notes || String(issue.notes).trim().length < 5) {
          const e = new Error("Direct issue requires reason in notes");
          e.statusCode = 400;
          throw e;
        }
      }

      // If request-based: request must still be APPROVED
      if (isRequestBased) {
        const reqRow = await tx.inventory_requests.findUnique({
          where: { id: issue.request_id },
          select: { id: true, status: true, warehouse_id: true, work_order_id: true },
        });

        if (!reqRow) {
          const e = new Error("Linked request not found");
          e.statusCode = 400;
          throw e;
        }
        if (reqRow.status !== "APPROVED") {
          const e = new Error("Linked request must be APPROVED before posting issue");
          e.statusCode = 400;
          throw e;
        }
        if (String(reqRow.warehouse_id) !== String(issue.warehouse_id)) {
          const e = new Error("Request warehouse mismatch");
          e.statusCode = 400;
          throw e;
        }
        if (reqRow.work_order_id && String(reqRow.work_order_id) !== String(issue.work_order_id)) {
          const e = new Error("Request work order mismatch");
          e.statusCode = 400;
          throw e;
        }
      }

      const partItemIds = issue.inventory_issue_lines.map((l) => l.part_item_id).filter(Boolean);

      if (partItemIds.length !== issue.inventory_issue_lines.length) {
        const e = new Error("All lines must include part_item_id (serial)");
        e.statusCode = 400;
        throw e;
      }

      // If request-based: verify reservations table if exists (optional)
      if (isRequestBased) {
        try {
          const reservations = await tx.inventory_request_reservations.findMany({
            where: { request_id: issue.request_id, part_item_id: { in: partItemIds } },
            select: { part_item_id: true },
          });

          const set = new Set(reservations.map((r) => r.part_item_id));
          for (const pid of partItemIds) {
            if (!set.has(pid)) {
              const e = new Error(`part_item is not reserved for this request: ${pid}`);
              e.statusCode = 409;
              throw e;
            }
          }
        } catch (e) {
          if (!isPrismaModelMissing(e)) {
            console.error("reservations check error:", e);
            const er = new Error("Failed to validate reservations");
            er.statusCode = 500;
            throw er;
          }
        }
      }

      const partItems = await tx.part_items.findMany({
        where: { id: { in: partItemIds } },
        select: { id: true, status: true, warehouse_id: true },
      });

      const map = new Map(partItems.map((p) => [p.id, p]));

      for (const line of issue.inventory_issue_lines) {
        const pi = map.get(line.part_item_id);

        if (!pi) {
          const e = new Error(`part_item not found: ${line.part_item_id}`);
          e.statusCode = 400;
          throw e;
        }

        if (String(pi.warehouse_id) !== String(issue.warehouse_id)) {
          const e = new Error(`part_item not in this warehouse: ${line.part_item_id}`);
          e.statusCode = 400;
          throw e;
        }

        if (isRequestBased) {
          // request-based => must be RESERVED
          if (pi.status !== "RESERVED") {
            const e = new Error(`part_item must be RESERVED (status=${pi.status}): ${line.part_item_id}`);
            e.statusCode = 409;
            throw e;
          }
        } else {
          // direct => must be IN_STOCK
          if (pi.status !== "IN_STOCK") {
            const e = new Error(`part_item must be IN_STOCK (status=${pi.status}): ${line.part_item_id}`);
            e.statusCode = 409;
            throw e;
          }
        }
      }

      // mark part_items as ISSUED
      await tx.part_items.updateMany({
        where: { id: { in: partItemIds } },
        data: { status: "ISSUED", last_moved_at: new Date() },
      });

      // post issue
      const posted = await tx.inventory_issues.update({
        where: { id: issue.id },
        data: { status: "POSTED", posted_at: new Date() },
      });

      // if linked to request: set request to ISSUED and clear reservations if table exists
      if (issue.request_id) {
        await tx.inventory_requests.update({
          where: { id: issue.request_id },
          data: { status: "ISSUED" },
        });

        // clear reservations if model exists
        try {
          await tx.inventory_request_reservations.deleteMany({
            where: { request_id: issue.request_id },
          });
        } catch (e) {
          if (!isPrismaModelMissing(e)) {
            console.error("reservations cleanup error:", e);
            const er = new Error("Failed to clear reservations");
            er.statusCode = 500;
            throw er;
          }
        }
      }

      return posted;
    });

    res.json({ message: "Issue posted", issue: result });
  } catch (err) {
    const sc = err?.statusCode || 500;
    if (sc !== 500) return res.status(sc).json({ message: String(err.message || "Error") });

    console.error("postIssue error:", err);
    res.status(500).json({ message: "Failed to post issue" });
  }
}

module.exports = {
  listIssues,
  getIssue,
  createIssueDraft,
  postIssue,
};
