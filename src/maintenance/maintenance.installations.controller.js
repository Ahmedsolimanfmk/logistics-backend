const prisma = require("../prisma");
const {
  getAuthUserId,
  getCompanyIdOrThrow,
} = require("../core/request-context");
const { assertUuid } = require("../core/validation");

function toNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  if (typeof v?.toNumber === "function") return v.toNumber();
  if (typeof v?.toString === "function") return Number(v.toString()) || 0;
  return 0;
}

/**
 * POST /maintenance/work-orders/:id/installations
 */
async function addInstallations(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const workOrderId = String(req.params.id || "").trim();
    assertUuid(workOrderId, "work order id");

    const { items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items[] is required" });
    }

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
      return res.status(404).json({ message: "Work order not found" });
    }

    assertUuid(String(wo.vehicle_id || ""), "work order vehicle_id");

    const st = String(wo.status || "").toUpperCase();
    if (["COMPLETED", "CANCELED", "CANCELLED"].includes(st)) {
      return res.status(409).json({
        message: `Work order is ${wo.status}. No installations allowed.`,
      });
    }

    const now = new Date();

    const payload = [];
    for (const [idx, it] of items.entries()) {
      const part_id = String(it?.part_id || "").trim();
      const part_item_id =
        it?.part_item_id != null && String(it.part_item_id).trim()
          ? String(it.part_item_id).trim()
          : null;

      const qty = it?.qty_installed == null ? 1 : Number(it.qty_installed);

      assertUuid(part_id, `items[${idx}].part_id`);

      if (part_item_id) {
        assertUuid(part_item_id, `items[${idx}].part_item_id`);

        if (!Number.isFinite(qty) || qty !== 1) {
          return res.status(400).json({
            message: `items[${idx}].qty_installed must be 1 for serial items`,
          });
        }
      } else {
        if (!Number.isFinite(qty) || qty <= 0) {
          return res.status(400).json({
            message: `items[${idx}].qty_installed must be > 0`,
          });
        }
      }

      const odometer =
        it?.odometer !== undefined && it?.odometer !== null
          ? Number(it.odometer)
          : null;

      if (odometer !== null && (!Number.isFinite(odometer) || odometer < 0)) {
        return res.status(400).json({
          message: `items[${idx}].odometer must be >= 0`,
        });
      }

      payload.push({
        company_id: companyId,
        part_id,
        part_item_id,
        qty_installed: qty,
        odometer_at_install: odometer,
        notes: it?.notes != null ? String(it.notes).trim() : null,
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

    const vehicleId = wo.vehicle_id;

    const created = await prisma.$transaction(async (tx) => {
      const serialItems = payload.filter((p) => Boolean(p.part_item_id));

      if (serialItems.length) {
        const serialIds = serialItems.map((p) => p.part_item_id);

        const issuedSerialLines = await tx.inventory_issue_lines.findMany({
          where: {
            company_id: companyId,
            part_item_id: { in: serialIds },
            inventory_issues: {
              is: {
                company_id: companyId,
                work_order_id: workOrderId,
              },
            },
          },
          select: { part_item_id: true },
        });

        const issuedSet = new Set(
          (issuedSerialLines || []).map((x) => x.part_item_id)
        );

        for (const sid of serialIds) {
          if (!issuedSet.has(sid)) {
            const e = new Error(
              `Serial part_item was not issued for this work order: ${sid}`
            );
            e.statusCode = 409;
            throw e;
          }
        }

        const partItems = await tx.part_items.findMany({
          where: {
            company_id: companyId,
            id: { in: serialIds },
          },
          select: {
            id: true,
            company_id: true,
            part_id: true,
            status: true,
          },
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
            const e = new Error(
              `part_item does not match part_id: ${p.part_item_id}`
            );
            e.statusCode = 400;
            throw e;
          }

          if (pi.status !== "ISSUED") {
            const e = new Error(
              `part_item must be ISSUED before install (current=${pi.status}): ${p.part_item_id}`
            );
            e.statusCode = 409;
            throw e;
          }
        }

        const upd = await tx.part_items.updateMany({
          where: {
            company_id: companyId,
            id: { in: serialIds },
            status: "ISSUED",
          },
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

      const bulkItems = payload.filter((p) => !p.part_item_id);
      if (bulkItems.length) {
        const bulkPartIds = [...new Set(bulkItems.map((b) => b.part_id))];

        const issuedAgg = await tx.inventory_issue_lines.groupBy({
          by: ["part_id"],
          where: {
            company_id: companyId,
            part_id: { in: bulkPartIds },
            inventory_issues: {
              is: {
                company_id: companyId,
                work_order_id: workOrderId,
              },
            },
          },
          _sum: { qty: true },
        });

        const installedAgg = await tx.work_order_installations.groupBy({
          by: ["part_id"],
          where: {
            company_id: companyId,
            work_order_id: workOrderId,
            part_id: { in: bulkPartIds },
          },
          _sum: { qty_installed: true },
        });

        const issuedMap = new Map(
          issuedAgg.map((x) => [x.part_id, toNum(x._sum?.qty)])
        );
        const installedMap = new Map(
          installedAgg.map((x) => [x.part_id, toNum(x._sum?.qty_installed)])
        );

        const addMap = new Map();
        for (const b of bulkItems) {
          addMap.set(
            b.part_id,
            (addMap.get(b.part_id) || 0) + toNum(b.qty_installed)
          );
        }

        for (const partId of bulkPartIds) {
          const issued = toNum(issuedMap.get(partId));
          const installed = toNum(installedMap.get(partId));
          const addNow = toNum(addMap.get(partId));
          const next = installed + addNow;

          if (next > issued + 0.0005) {
            const e = new Error(
              `Installed qty exceeds issued qty for this work order (part=${partId})`
            );
            e.statusCode = 409;
            throw e;
          }
        }
      }

      const rows = await Promise.all(
        payload.map((p) =>
          tx.work_order_installations.create({
            data: {
              company_id: companyId,
              maintenance_work_orders: { connect: { id: workOrderId } },
              vehicles: { connect: { id: vehicleId } },
              parts: { connect: { id: p.part_id } },
              ...(p.part_item_id
                ? { part_items: { connect: { id: p.part_item_id } } }
                : {}),
              qty_installed: p.qty_installed,
              installed_by: userId,
              installed_at: now,
              odometer_at_install: p.odometer_at_install,
              notes: p.notes,
            },
          })
        )
      );

      if (String(wo.status || "").toUpperCase() === "OPEN") {
        const woUpd = await tx.maintenance_work_orders.updateMany({
          where: {
            id: wo.id,
            company_id: companyId,
            status: "OPEN",
          },
          data: {
            status: "IN_PROGRESS",
            started_at: now,
            updated_at: now,
          },
        });

        if (woUpd.count !== 1) {
          const e = new Error("Work order status update failed");
          e.statusCode = 409;
          throw e;
        }
      }

      return rows;
    });

    return res.status(201).json({
      message: "Installations added",
      installations: created,
    });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: String(e.message || "Error") });
    }

    console.error("ADD INSTALLATIONS ERROR:", e);
    return res.status(500).json({
      message: "Failed to add installations",
      error: e.message,
    });
  }
}

async function listInstallations(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const workOrderId = String(req.params.id || "").trim();
    assertUuid(workOrderId, "work order id");

    const wo = await prisma.maintenance_work_orders.findFirst({
      where: {
        id: workOrderId,
        company_id: companyId,
      },
      select: { id: true },
    });

    if (!wo) {
      return res.status(404).json({ message: "Work order not found" });
    }

    const rows = await prisma.work_order_installations.findMany({
      where: {
        company_id: companyId,
        work_order_id: workOrderId,
      },
      orderBy: { installed_at: "desc" },
      include: {
        parts: true,
        part_items: true,
        vehicles: true,
      },
    });

    return res.json({ items: rows });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("LIST INSTALLATIONS ERROR:", e);
    return res.status(500).json({
      message: "Failed to list installations",
      error: e.message,
    });
  }
}

module.exports = {
  addInstallations,
  listInstallations,
};