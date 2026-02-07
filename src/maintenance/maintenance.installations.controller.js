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
 *     { "part_id": "...", "qty_installed": 2, "odometer": 125000, "notes": "..." }
 *   ]
 * }
 */
async function addInstallations(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const workOrderId = req.params.id;
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
    if (["COMPLETED", "CANCELED"].includes(st)) {
      return res.status(409).json({ message: `Work order is ${wo.status}. No installations allowed.` });
    }

    const now = new Date();

    // validate & payload
    const payload = [];
    for (const [idx, it] of items.entries()) {
      const part_id = it?.part_id;
      const qty = Number(it?.qty_installed);

      if (!isUuid(part_id)) {
        return res.status(400).json({ message: `items[${idx}].part_id must be uuid` });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ message: `items[${idx}].qty_installed must be > 0` });
      }

      const odometer =
        it?.odometer !== undefined && it?.odometer !== null ? Number(it.odometer) : null;

      if (odometer !== null && (!Number.isFinite(odometer) || odometer < 0)) {
        return res.status(400).json({ message: `items[${idx}].odometer must be >= 0` });
      }

      payload.push({
        part_id,
        qty_installed: qty,
        odometer_at_install: odometer,
        notes: it?.notes ? String(it.notes).trim() : null,
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
      const rows = await Promise.all(
        payload.map((p) =>
          tx.work_order_installations.create({
            data: {
              // ✅ required relations (حسب error اللي ظهر عندك)
              maintenance_work_orders: { connect: { id: workOrderId } },
              vehicles: { connect: { id: vehicleId } },
              parts: { connect: { id: p.part_id } },

              // ✅ scalar columns فقط
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
    console.log("ADD INSTALLATIONS ERROR:", e);
    return res.status(500).json({ message: "Failed to add installations", error: e.message });
  }
}

async function listInstallations(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const workOrderId = req.params.id;
    if (!isUuid(workOrderId)) return res.status(400).json({ message: "Invalid work order id" });

    // لو schema عندك ما فيهاش work_order_id scalar وبتعتمد على relation فقط
    // ابعتلي error وساعتها هنخليها where: { maintenance_work_orders: { id: workOrderId } }
    const rows = await prisma.work_order_installations.findMany({
      where: { work_order_id: workOrderId },
      orderBy: { installed_at: "desc" },
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
