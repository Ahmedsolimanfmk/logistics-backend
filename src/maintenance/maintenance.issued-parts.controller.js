const prisma = require("../prisma");
const {
  getAuthUserId,
  getCompanyIdOrThrow,
} = require("../core/request-context");
const { assertUuid } = require("../core/validation");

function toNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v?.toNumber === "function") return v.toNumber();
  return Number(v) || 0;
}

function round3(v) {
  return Math.round(toNum(v) * 1000) / 1000;
}

async function listIssuedParts(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const work_order_id = String(req.query.work_order_id || "").trim();
    const status = String(req.query.status || "").trim().toUpperCase();

    if (work_order_id) {
      assertUuid(work_order_id, "work_order_id");
    }

    const issueWhere = {
      company_id: companyId,
      ...(work_order_id ? { work_order_id } : {}),
    };

    const issueLinesRaw = await prisma.inventory_issue_lines.findMany({
      where: {
        company_id: companyId,
        issue: {
          is: issueWhere,
        },
      },
      orderBy: {
        created_at: "desc",
      },
      include: {
        part: {
          select: {
            id: true,
            name: true,
            part_number: true,
            brand: true,
            unit: true,
          },
        },
        part_item: {
          select: {
            id: true,
            internal_serial: true,
            manufacturer_serial: true,
            status: true,
          },
        },
        issue: {
          select: {
            id: true,
            warehouse_id: true,
            work_order_id: true,
            issued_at: true,
            status: true,
            warehouse: {
              select: {
                id: true,
                name: true,
                location: true,
              },
            },
            work_order: {
              select: {
                id: true,
                status: true,
                vehicle_id: true,
                vehicle: {
                  select: {
                    id: true,
                    fleet_no: true,
                    plate_no: true,
                    display_name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const issueLines = issueLinesRaw.filter((x) => {
      if (work_order_id) return true;
      return Boolean(x.issue?.work_order_id);
    });

    const workOrderIds = [
      ...new Set(issueLines.map((x) => x.issue?.work_order_id).filter(Boolean)),
    ];

    const partIds = [
      ...new Set(issueLines.map((x) => x.part_id).filter(Boolean)),
    ];

    let installations = [];

    if (workOrderIds.length > 0 && partIds.length > 0) {
      installations = await prisma.work_order_installations.findMany({
        where: {
          company_id: companyId,
          work_order_id: { in: workOrderIds },
          part_id: { in: partIds },
        },
        orderBy: {
          installed_at: "desc",
        },
        include: {
          part: {
            select: {
              id: true,
              name: true,
              part_number: true,
              brand: true,
              unit: true,
            },
          },
        },
      });
    }

    const installedMap = new Map();

    for (const ins of installations) {
      const key = `${ins.work_order_id}:${ins.part_id}`;
      const prev = installedMap.get(key) || {
        qty: 0,
        last_installed_at: null,
        rows: [],
      };

      const qty = toNum(ins.qty_installed);
      prev.qty += qty;
      prev.rows.push(ins);

      if (
        !prev.last_installed_at ||
        new Date(ins.installed_at).getTime() >
          new Date(prev.last_installed_at).getTime()
      ) {
        prev.last_installed_at = ins.installed_at;
      }

      installedMap.set(key, prev);
    }

    const grouped = new Map();

    for (const line of issueLines) {
      const woId = line.issue?.work_order_id;
      if (!woId) continue;

      const key = `${woId}:${line.part_id}`;

      const prev = grouped.get(key) || {
        work_order_id: woId,
        issue_ids: new Set(),
        issue_line_ids: [],
        part_id: line.part_id,
        part: line.part || null,
        warehouse: line.issue?.warehouse || null,
        work_order: line.issue?.work_order || null,
        issued_qty: 0,
        issued_at: null,
        serial_items: [],
      };

      prev.issue_ids.add(line.issue_id);
      prev.issue_line_ids.push(line.id);
      prev.issued_qty += toNum(line.qty);

      if (
        !prev.issued_at ||
        new Date(line.issue?.issued_at || 0).getTime() >
          new Date(prev.issued_at || 0).getTime()
      ) {
        prev.issued_at = line.issue?.issued_at || null;
      }

      if (line.part_item) {
        prev.serial_items.push(line.part_item);
      }

      grouped.set(key, prev);
    }

    let items = Array.from(grouped.values()).map((row) => {
      const key = `${row.work_order_id}:${row.part_id}`;
      const installed = installedMap.get(key) || {
        qty: 0,
        last_installed_at: null,
        rows: [],
      };

      const issuedQty = round3(row.issued_qty);
      const installedQty = round3(installed.qty);
      const remainingQty = round3(Math.max(0, issuedQty - installedQty));

      let rowStatus = "NOT_INSTALLED";
      if (installedQty > 0 && remainingQty > 0) rowStatus = "PARTIAL";
      if (issuedQty > 0 && remainingQty <= 0) rowStatus = "INSTALLED";

      return {
        work_order_id: row.work_order_id,
        issue_ids: Array.from(row.issue_ids),
        issue_line_ids: row.issue_line_ids,

        part_id: row.part_id,
        part: row.part,

        warehouse: row.warehouse,
        work_order: row.work_order,
        vehicle: row.work_order?.vehicle || null,

        issued_qty: issuedQty,
        installed_qty: installedQty,
        remaining_qty: remainingQty,

        issued_at: row.issued_at,
        last_installed_at: installed.last_installed_at,
        installations: installed.rows,

        serial_items: row.serial_items,
        status: rowStatus,
      };
    });

    if (status && status !== "ALL") {
      items = items.filter((x) => x.status === status);
    }

    return res.json({ items });
  } catch (e) {
    console.error("LIST ISSUED PARTS ERROR:", e);

    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    return res.status(500).json({
      message: "Failed to list issued parts",
      error: e?.message || String(e),
      code: e?.code,
      meta: e?.meta,
    });
  }
}

async function installIssuedPart(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const workOrderId = String(req.params.workOrderId || "").trim();
    const partId = String(req.params.partId || "").trim();

    assertUuid(workOrderId, "work_order_id");
    assertUuid(partId, "part_id");

    const qty = Number(req.body?.qty_installed || req.body?.qty || 0);
    const notes =
      req.body?.notes != null ? String(req.body.notes).trim() : null;

    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ message: "qty_installed must be > 0" });
    }

    const wo = await prisma.maintenance_work_orders.findFirst({
      where: {
        id: workOrderId,
        company_id: companyId,
      },
      select: {
        id: true,
        status: true,
        vehicle_id: true,
      },
    });

    if (!wo) {
      return res.status(404).json({ message: "Work order not found" });
    }

    const st = String(wo.status || "").toUpperCase();
    if (["COMPLETED", "CANCELED", "CANCELLED"].includes(st)) {
      return res.status(409).json({
        message: `Work order is ${wo.status}`,
      });
    }

    const issuedAgg = await prisma.inventory_issue_lines.aggregate({
      where: {
        company_id: companyId,
        part_id: partId,
        issue: {
          is: {
            company_id: companyId,
            work_order_id: workOrderId,
          },
        },
      },
      _sum: {
        qty: true,
      },
    });

    const installedAgg = await prisma.work_order_installations.aggregate({
      where: {
        company_id: companyId,
        work_order_id: workOrderId,
        part_id: partId,
      },
      _sum: {
        qty_installed: true,
      },
    });

    const issuedQty = toNum(issuedAgg._sum?.qty);
    const installedQty = toNum(installedAgg._sum?.qty_installed);
    const remainingQty = issuedQty - installedQty;

    if (issuedQty <= 0) {
      return res.status(409).json({
        message: "No issued quantity found for this part and work order",
      });
    }

    if (qty > remainingQty + 0.0005) {
      return res.status(409).json({
        message: `Installed qty exceeds remaining issued qty. Remaining ${round3(
          remainingQty
        )}`,
      });
    }

    const now = new Date();

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.work_order_installations.create({
        data: {
          company_id: companyId,
          work_order_id: workOrderId,
          vehicle_id: wo.vehicle_id,
          part_id: partId,
          part_item_id: null,
          qty_installed: qty,
          installed_by: userId,
          installed_at: now,
          notes,
        },
        include: {
          part: true,
          vehicle: true,
          work_order: true,
        },
      });

      if (st === "OPEN") {
        await tx.maintenance_work_orders.updateMany({
          where: {
            id: workOrderId,
            company_id: companyId,
            status: "OPEN",
          },
          data: {
            status: "IN_PROGRESS",
            started_at: now,
            updated_at: now,
          },
        });
      }

      return row;
    });

    return res.status(201).json({
      message: "Part installed",
      installation: created,
    });
  } catch (e) {
    console.error("INSTALL ISSUED PART ERROR:", e);

    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    return res.status(500).json({
      message: "Failed to install issued part",
      error: e?.message || String(e),
      code: e?.code,
      meta: e?.meta,
    });
  }
}

module.exports = {
  listIssuedParts,
  installIssuedPart,
};