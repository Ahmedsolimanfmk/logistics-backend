// =======================
// src/maintenance/maintenance.installations.controller.js
// =======================

const prisma = require("./prisma");

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
 * POST /maintenance/work-orders/:id/installations
 * body:
 * {
 *   "items": [
 *     // ✅ Serial item (from inventory issue)
 *     { "part_id": "...", "part_item_id": "...", "qty_installed": 1, "odometer": 125000, "notes": "..." },
 *
 *     // ✅ Bulk item (non-serial)
 *     { "part_id": "...", "qty_installed": 2, "odometer": 125000, "notes": "..." }
 *   ]
 * }
 */
async function addInstallations(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const workOrderId = String(req.params.id || "").trim();
    if (!isUuid(workOrderId)) return res.status(400).json({ message: "Invalid work order id" });

    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items[] is required" });
    }

    const wo = await prisma.maintenance_work_orders.findUnique({
      where: { id: workOrderId },
      select: { id: true, status: true, vehicle_id: true },
    });

    if (!wo) return res.status(404).json({ message: "Work order not found" });
    if (!isUuid(wo.vehicle_id)) {
      return res.status(500).json({ message: "Work order missing vehicle_id (data issue)" });
    }

    const st = String(wo.status || "").toUpperCase();
    if (["COMPLETED", "CANCELED", "CANCELLED"].includes(st)) {
      return res.status(409).json({ message: `Work order is ${wo.status}. No installations allowed.` });
    }

    const now = new Date();

    // -----------------------
    // validate & normalize payload
    // -----------------------
    const payload = [];
    for (const [idx, it] of items.entries()) {
      const part_id = String(it?.part_id || "").trim();
      const part_item_id =
        it?.part_item_id != null && String(it.part_item_id).trim()
          ? String(it.part_item_id).trim()
          : null;

      const qty = it?.qty_installed == null ? 1 : Number(it.qty_installed);

      if (!isUuid(part_id)) {
        return res.status(400).json({ message: `items[${idx}].part_id must be uuid` });
      }

      // ✅ serial must be qty = 1
      if (part_item_id) {
        if (!isUuid(part_item_id)) {
          return res.status(400).json({ message: `items[${idx}].part_item_id must be uuid` });
        }
        if (!Number.isFinite(qty) || qty !== 1) {
          return res.status(400).json({ message: `items[${idx}].qty_installed must be 1 for serial items` });
        }
      } else {
        // bulk
        if (!Number.isFinite(qty) || qty <= 0) {
          return res.status(400).json({ message: `items[${idx}].qty_installed must be > 0` });
        }
      }

      const odometer =
        it?.odometer !== undefined && it?.odometer !== null ? Number(it.odometer) : null;

      if (odometer !== null && (!Number.isFinite(odometer) || odometer < 0)) {
        return res.status(400).json({ message: `items[${idx}].odometer must be >= 0` });
      }

      payload.push({
        part_id,
        part_item_id,
        qty_installed: qty,
        odometer_at_install: odometer,
        notes: it?.notes != null ? String(it.notes).trim() : null,
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

    const vehicleId = wo.vehicle_id;

    const created = await prisma.$transaction(async (tx) => {
      // -----------------------
      // Serial validation (ISSUED -> INSTALLED)
      // -----------------------
      const serialItems = payload.filter((p) => Boolean(p.part_item_id));
      if (serialItems.length) {
        const serialIds = serialItems.map((p) => p.part_item_id);

        const partItems = await tx.part_items.findMany({
          where: { id: { in: serialIds } },
          select: { id: true, part_id: true, status: true },
        });

        const map = new Map(partItems.map((x) => [x.id, x]));

        for (const p of serialItems) {
          const pi = map.get(p.part_item_id);
          if (!pi) {
            const e = new Error(`part_item not found: ${p.part_item_id}`);
            e.statusCode = 400;
            throw e;
          }
          if (pi.part_id !== p.part_id) {
            const e = new Error(`part_item does not match part_id: ${p.part_item_id}`);
            e.statusCode = 400;
            throw e;
          }
          // ✅ لازم تكون ISSUED (يعني اتصرفت من المخزن)
          if (pi.status !== "ISSUED") {
            const e = new Error(`part_item must be ISSUED before install (current=${pi.status}): ${p.part_item_id}`);
            e.statusCode = 409;
            throw e;
          }
        }

        // update part_items -> INSTALLED
        const upd = await tx.part_items.updateMany({
          where: { id: { in: serialIds }, status: "ISSUED" },
          data: {
            status: "INSTALLED",
            installed_vehicle_id: vehicleId,
            installed_at: now,
            last_moved_at: now,
          },
        });

        if (upd.count !== serialIds.length) {
          const e = new Error("Stock changed while installing. Please retry.");
          e.statusCode = 409;
          throw e;
        }
      }

      // -----------------------
      // Create installations rows
      // -----------------------
      const rows = await Promise.all(
        payload.map((p) =>
          tx.work_order_installations.create({
            data: {
              maintenance_work_orders: { connect: { id: workOrderId } },
              vehicles: { connect: { id: vehicleId } },
              parts: { connect: { id: p.part_id } },

              // ✅ link serial if provided
              ...(p.part_item_id ? { part_items: { connect: { id: p.part_item_id } } } : {}),

              qty_installed: p.qty_installed,
              installed_by: userId,
              installed_at: now,
              odometer_at_install: p.odometer_at_install,
              notes: p.notes,
            },
          })
        )
      );

      // optional: لو الـ work order كان OPEN خليه IN_PROGRESS
      if (String(wo.status || "").toUpperCase() === "OPEN") {
        await tx.maintenance_work_orders.update({
          where: { id: wo.id },
          data: { status: "IN_PROGRESS", started_at: now, updated_at: now },
        });
      }

      return rows;
    });

    return res.status(201).json({ message: "Installations added", installations: created });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) return res.status(sc).json({ message: String(e.message || "Error") });

    console.log("ADD INSTALLATIONS ERROR:", e);
    return res.status(500).json({ message: "Failed to add installations", error: e.message });
  }
}

async function listInstallations(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const workOrderId = String(req.params.id || "").trim();
    if (!isUuid(workOrderId)) return res.status(400).json({ message: "Invalid work order id" });

    const rows = await prisma.work_order_installations.findMany({
      where: { work_order_id: workOrderId },
      orderBy: { installed_at: "desc" },
      include: {
        parts: true,
        part_items: true,
        vehicles: true,
      },
    });

    return res.json({ items: rows });
  } catch (e) {
    console.log("LIST INSTALLATIONS ERROR:", e);
    return res.status(500).json({ message: "Failed to list installations", error: e.message });
  }
}

module.exports = {
  addInstallations,
  listInstallations,
};
