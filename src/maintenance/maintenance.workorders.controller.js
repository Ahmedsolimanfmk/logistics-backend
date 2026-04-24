const prisma = require("../prisma");
const {
  getAuthUserId,
  getCompanyIdOrThrow,
} = require("../core/request-context");
const { assertUuid } = require("../core/validation");
const {
  isAdminOrAccountant,
  assertMaintenanceVehicleAccess,
} = require("./maintenance.access");

function toNum(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  if (typeof v?.toNumber === "function") return v.toNumber();
  if (typeof v?.toString === "function") return Number(v.toString()) || 0;
  return 0;
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parseIntQuery(v, fallback) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function buildRuntimeReport(woFull, opts = {}) {
  const labor = toNum(opts.labor_cost);
  const service = toNum(opts.service_cost);

  const issuedByPart = new Map();
  let issuedTotalCost = 0;
  let issuedTotalQty = 0;
  const issuedLinesFlat = [];

  for (const issue of woFull.inventory_issues || []) {
    for (const line of issue.inventory_issue_lines || []) {
      const part = line.parts || null;
      const partId = line.part_id;

      const qty = toNum(line.qty);
      const totalCost = toNum(line.total_cost);

      issuedTotalQty += qty;
      issuedTotalCost += totalCost;

      issuedLinesFlat.push({
        issue_id: issue.id,
        part_id: partId,
        part,
        qty: round3(qty),
        unit_cost: round2(toNum(line.unit_cost)),
        total_cost: round2(totalCost),
        notes: line.notes || null,
        part_item_id: line.part_item_id || null,
        part_item: line.part_items
          ? {
              id: line.part_items.id,
              internal_serial: line.part_items.internal_serial,
              manufacturer_serial: line.part_items.manufacturer_serial,
              status: line.part_items.status,
            }
          : null,
      });

      const prev = issuedByPart.get(partId) || { part, qty: 0, cost: 0 };
      issuedByPart.set(partId, {
        part: prev.part || part,
        qty: prev.qty + qty,
        cost: prev.cost + totalCost,
      });
    }
  }

  const installedByPart = new Map();
  let installedTotalQty = 0;
  const installationsFlat = [];

  for (const ins of woFull.work_order_installations || []) {
    const part = ins.parts || null;
    const partId = ins.part_id;
    const qty = toNum(ins.qty_installed);

    installedTotalQty += qty;

    installationsFlat.push({
      id: ins.id,
      part_id: partId,
      part,
      qty_installed: round3(qty),
      installed_at: ins.installed_at || null,
      installed_by: ins.installed_by || null,
      odometer_at_install: ins.odometer_at_install ?? null,
      warranty_until_date: ins.warranty_until_date || null,
      warranty_until_km: ins.warranty_until_km ?? null,
      notes: ins.notes || null,
    });

    const prev = installedByPart.get(partId) || { part: null, qty: 0 };
    installedByPart.set(partId, {
      part: prev.part || part,
      qty: prev.qty + qty,
    });
  }

  const mismatch = {
    issued_not_installed: [],
    installed_not_issued: [],
    matched: [],
  };

  const allPartIds = new Set([...issuedByPart.keys(), ...installedByPart.keys()]);

  for (const partId of allPartIds) {
    const issued = issuedByPart.get(partId) || { part: null, qty: 0, cost: 0 };
    const installed = installedByPart.get(partId) || { part: null, qty: 0 };

    const delta = issued.qty - installed.qty;
    const part = issued.part || installed.part || null;

    if (Math.abs(delta) < 0.0005) {
      mismatch.matched.push({
        part_id: partId,
        part,
        issued_qty: round3(issued.qty),
        installed_qty: round3(installed.qty),
        issued_cost: round2(issued.cost),
      });
    } else if (delta > 0) {
      mismatch.issued_not_installed.push({
        part_id: partId,
        part,
        issued_qty: round3(issued.qty),
        installed_qty: round3(installed.qty),
        extra_issued_qty: round3(delta),
        issued_cost: round2(issued.cost),
      });
    } else {
      mismatch.installed_not_issued.push({
        part_id: partId,
        part,
        issued_qty: round3(issued.qty),
        installed_qty: round3(installed.qty),
        extra_installed_qty: round3(-delta),
        issued_cost: round2(issued.cost),
      });
    }
  }

  const totals = {
    issued_total_qty: round3(issuedTotalQty),
    installed_total_qty: round3(installedTotalQty),
    parts_cost_total: round2(issuedTotalCost),
    labor_cost: round2(labor),
    service_cost: round2(service),
    grand_total: round2(issuedTotalCost + labor + service),
    mismatch_counts: {
      issued_not_installed: mismatch.issued_not_installed.length,
      installed_not_issued: mismatch.installed_not_issued.length,
      matched: mismatch.matched.length,
    },
  };

  return {
    issued: {
      issues_count: (woFull.inventory_issues || []).length,
      lines: issuedLinesFlat,
      by_part: Array.from(issuedByPart.entries()).map(([part_id, v]) => ({
        part_id,
        part: v.part,
        qty: round3(v.qty),
        cost: round2(v.cost),
      })),
    },
    installed: {
      installations_count: (woFull.work_order_installations || []).length,
      installations: installationsFlat,
      by_part: Array.from(installedByPart.entries()).map(([part_id, v]) => ({
        part_id,
        part: v.part,
        qty_installed: round3(v.qty),
      })),
    },
    reconciliation: mismatch,
    totals,
  };
}

async function listWorkOrders(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const page = Math.max(1, parseIntQuery(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, parseIntQuery(req.query.limit, 20)));
    const skip = (page - 1) * limit;

    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const vehicle_id = req.query.vehicle_id ? String(req.query.vehicle_id) : null;
    const request_id = req.query.request_id ? String(req.query.request_id) : null;
    const vendor_id = req.query.vendor_id ? String(req.query.vendor_id) : null;
    const q = req.query.q ? String(req.query.q).trim() : "";

    const where = {
      company_id: companyId,
    };

    if (status) where.status = status;

    if (vehicle_id) {
      assertUuid(vehicle_id, "vehicle_id");
      where.vehicle_id = vehicle_id;
    }

    if (request_id) {
      assertUuid(request_id, "request_id");
      where.request_id = request_id;
    }

    if (vendor_id) {
      assertUuid(vendor_id, "vendor_id");
      where.vendor_id = vendor_id;
    }

    if (!isAdminOrAccountant(req)) {
      const portfolioRows = await prisma.vehicle_portfolio.findMany({
        where: {
          company_id: companyId,
          field_supervisor_id: userId,
          is_active: true,
        },
        select: { vehicle_id: true },
      });

      const vehicleIds = portfolioRows.map((x) => x.vehicle_id).filter(Boolean);

      if (vehicleIds.length === 0) {
        return res.json({
          page,
          limit,
          total: 0,
          items: [],
        });
      }

      where.vehicle_id = where.vehicle_id ? where.vehicle_id : { in: vehicleIds };
    }

    if (q) {
      where.OR = [
        {
          vendors: {
            is: {
              name: { contains: q, mode: "insensitive" },
            },
          },
        },
        { notes: { contains: q, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.maintenance_work_orders.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          company_id: true,
          status: true,
          type: true,
          maintenance_mode: true,
          vendor_id: true,
          opened_at: true,
          started_at: true,
          completed_at: true,
          odometer: true,
          notes: true,
          vehicle_id: true,
          request_id: true,
          created_at: true,
          updated_at: true,
          vehicles: {
            select: {
              id: true,
              fleet_no: true,
              plate_no: true,
              display_name: true,
              status: true,
              current_odometer: true,
            },
          },
          vendors: {
            select: {
              id: true,
              name: true,
              code: true,
              vendor_type: true,
              classification: true,
              status: true,
              phone: true,
              city: true,
            },
          },
        },
      }),
      prisma.maintenance_work_orders.count({ where }),
    ]);

    return res.json({
      page,
      limit,
      total,
      items,
    });
    } catch (e) {
    console.error("LIST WORK ORDERS ERROR:", e);

    const sc = e?.statusCode || 500;

    if (sc !== 500) {
      return res.status(sc).json({
        message: e.message,
      });
    }

    return res.status(500).json({
      message: "Failed to list work orders",
      error: e?.message || String(e),
      code: e?.code,
      meta: e?.meta,
    });
  }
}

async function getWorkOrderById(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const id = String(req.params.id || "");
    assertUuid(id, "work order id");

    const row = await prisma.maintenance_work_orders.findFirst({
      where: {
        id,
        company_id: companyId,
      },
      include: {
        vehicles: {
          select: {
            id: true,
            fleet_no: true,
            plate_no: true,
            display_name: true,
            status: true,
            current_odometer: true,
          },
        },
        vendors: {
          select: {
            id: true,
            name: true,
            code: true,
            vendor_type: true,
            classification: true,
            status: true,
            specialization: true,
            contact_person: true,
            phone: true,
            phone2: true,
            email: true,
            address: true,
            city: true,
          },
        },
        post_maintenance_reports: true,
      },
    });

    if (!row) {
      return res.status(404).json({ message: "Work order not found" });
    }

    await assertMaintenanceVehicleAccess({
      req,
      vehicleId: row.vehicle_id,
    });

    return res.json({ work_order: row });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("GET WORK ORDER ERROR:", e);
    return res.status(500).json({ message: "Failed to get work order" });
  }
}

async function getWorkOrderReport(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const workOrderId = String(req.params.id || "");
    assertUuid(workOrderId, "work order id");

    const woFull = await prisma.maintenance_work_orders.findFirst({
      where: {
        id: workOrderId,
        company_id: companyId,
      },
      include: {
        vehicles: {
          select: {
            id: true,
            plate_no: true,
            display_name: true,
            status: true,
            current_odometer: true,
          },
        },
        vendors: {
          select: {
            id: true,
            name: true,
            code: true,
            vendor_type: true,
            classification: true,
            status: true,
            specialization: true,
            contact_person: true,
            phone: true,
            phone2: true,
            email: true,
            address: true,
            city: true,
          },
        },
        inventory_issues: {
          where: {
            company_id: companyId,
          },
          include: {
            inventory_issue_lines: {
              where: {
                company_id: companyId,
              },
              include: {
                parts: {
                  select: { id: true, name: true, part_number: true, brand: true, unit: true },
                },
                part_items: {
                  select: {
                    id: true,
                    internal_serial: true,
                    manufacturer_serial: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
        work_order_installations: {
          where: {
            company_id: companyId,
          },
          include: {
            parts: {
              select: { id: true, name: true, part_number: true, brand: true, unit: true },
            },
          },
        },
        post_maintenance_reports: true,
        cash_expenses: {
          where: {
            company_id: companyId,
            maintenance_work_order_id: workOrderId,
          },
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            amount: true,
            expense_type: true,
            notes: true,
            receipt_url: true,
            approval_status: true,
            approved_at: true,
            approved_by: true,
            payment_source: true,
            created_at: true,
            created_by: true,
            cash_advance_id: true,
            vendor_id: true,
            vendors: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    if (!woFull) {
      return res.status(404).json({ message: "Work order not found" });
    }

    await assertMaintenanceVehicleAccess({
      req,
      vehicleId: woFull.vehicle_id,
    });

    const report_runtime = buildRuntimeReport(woFull);
    const totals = report_runtime.totals;

    const woExpenses = woFull.cash_expenses || [];

    const approvedExpenses = woExpenses.filter(
      (e) => String(e.approval_status || "").toUpperCase() === "APPROVED"
    );

    const maintenance_cash_cost_total = round2(
      approvedExpenses.reduce((s, e) => s + toNum(e.amount), 0)
    );

    const approved_company_total = round2(
      approvedExpenses
        .filter((e) => String(e.payment_source || "").toUpperCase() === "COMPANY")
        .reduce((s, e) => s + toNum(e.amount), 0)
    );

    const approved_supervisor_total = round2(
      approvedExpenses
        .filter((e) => String(e.payment_source || "").toUpperCase() === "ADVANCE")
        .reduce((s, e) => s + toNum(e.amount), 0)
    );

    totals.maintenance_cash_cost_total = maintenance_cash_cost_total;
    totals.maintenance_company_cost_total = approved_company_total;
    totals.maintenance_supervisor_cost_total = approved_supervisor_total;

    totals.grand_total = round2(
      totals.parts_cost_total +
        totals.labor_cost +
        totals.service_cost +
        maintenance_cash_cost_total
    );

    const mismatchCount =
      totals.mismatch_counts.issued_not_installed +
      totals.mismatch_counts.installed_not_issued;

    let report_status = "OK";
    if (mismatchCount > 0) report_status = "NEEDS_PARTS_RECONCILIATION";
    else if (!woFull.post_maintenance_reports) report_status = "NEEDS_QA";
    else if (
      String(woFull.post_maintenance_reports?.road_test_result || "").toUpperCase() ===
      "FAIL"
    ) {
      report_status = "QA_FAILED";
    }

    return res.json({
      message: "Work order report",
      report_status,
      work_order: {
        id: woFull.id,
        status: woFull.status,
        type: woFull.type,
        maintenance_mode: woFull.maintenance_mode,
        vendor_id: woFull.vendor_id || null,
        vendor_name: woFull.vendors?.name || null,
        vendor: woFull.vendors || null,
        opened_at: woFull.opened_at,
        started_at: woFull.started_at,
        completed_at: woFull.completed_at,
        odometer: woFull.odometer,
        notes: woFull.notes,
        request_id: woFull.request_id ?? null,
      },
      vehicle: woFull.vehicles,
      post_report_db: woFull.post_maintenance_reports,
      work_order_expenses: woExpenses.map((x) => ({
        ...x,
        vendor_name: x.vendors?.name || null,
      })),
      report_runtime,
    });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("GET WORK ORDER REPORT ERROR:", e);
    return res.status(500).json({
      message: "Failed to get work order report",
      error: e?.message || String(e),
      stack: process.env.NODE_ENV === "production" ? undefined : e?.stack,
    });
  }
}

async function upsertPostReport(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isAdminOrAccountant(req)) {
      return res
        .status(403)
        .json({ message: "Only ADMIN/ACCOUNTANT can submit post report (for now)" });
    }

    const workOrderId = String(req.params.id || "");
    assertUuid(workOrderId, "work order id");

    const { road_test_result, checklist_json, remarks } = req.body || {};
    const now = new Date();

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

    const row = await prisma.post_maintenance_reports.upsert({
      where: { work_order_id: workOrderId },
      create: {
        company_id: companyId,
        work_order_id: workOrderId,
        checked_by: userId,
        checked_at: now,
        road_test_result: road_test_result ? String(road_test_result).toUpperCase() : null,
        checklist_json: checklist_json ?? null,
        remarks: remarks ? String(remarks) : null,
        created_at: now,
      },
      update: {
        checked_by: userId,
        checked_at: now,
        road_test_result: road_test_result ? String(road_test_result).toUpperCase() : null,
        checklist_json: checklist_json ?? null,
        remarks: remarks ? String(remarks) : null,
      },
    });

    return res.json({ message: "Post maintenance report saved", post_report: row });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("UPSERT POST REPORT ERROR:", e);
    return res.status(500).json({ message: "Failed to save post report", error: e.message });
  }
}

async function completeWorkOrder(req, res) {
  try {
    const userId = getAuthUserId(req);
    const companyId = getCompanyIdOrThrow(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!isAdminOrAccountant(req)) {
      return res
        .status(403)
        .json({ message: "Only ADMIN/ACCOUNTANT can complete work orders (for now)" });
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
        status: true,
        vehicle_id: true,
      },
    });

    if (!wo) {
      return res.status(404).json({ message: "Work order not found" });
    }

    const st = String(wo.status || "").toUpperCase();
    if (st === "COMPLETED") {
      return res.status(409).json({ message: "Work order already completed" });
    }
    if (st === "CANCELED" || st === "CANCELLED") {
      return res.status(409).json({ message: "Work order is canceled" });
    }

    const woFull = await prisma.maintenance_work_orders.findFirst({
      where: {
        id: workOrderId,
        company_id: companyId,
      },
      include: {
        inventory_issues: {
          where: { company_id: companyId },
          include: {
            inventory_issue_lines: {
              where: { company_id: companyId },
            },
          },
        },
        work_order_installations: {
          where: { company_id: companyId },
        },
        post_maintenance_reports: true,
      },
    });

    if (!woFull) {
      return res.status(404).json({ message: "Work order not found" });
    }

    const report_runtime = buildRuntimeReport(woFull);
    const mismatchCount =
      report_runtime.totals.mismatch_counts.issued_not_installed +
      report_runtime.totals.mismatch_counts.installed_not_issued;

    if (mismatchCount > 0) {
      return res.status(409).json({
        message: "Cannot complete work order before parts reconciliation is resolved",
      });
    }

    if (!woFull.post_maintenance_reports) {
      return res.status(409).json({
        message: "Cannot complete work order before post maintenance report is submitted",
      });
    }

    if (
      String(woFull.post_maintenance_reports?.road_test_result || "").toUpperCase() === "FAIL"
    ) {
      return res.status(409).json({
        message: "Cannot complete work order while QA result is FAIL",
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const woUpdated = await tx.maintenance_work_orders.updateMany({
        where: {
          id: workOrderId,
          company_id: companyId,
        },
        data: {
          status: "COMPLETED",
          completed_at: now,
          updated_at: now,
          notes: notes ? String(notes) : undefined,
        },
      });

      if (woUpdated.count !== 1) {
        const err = new Error("Work order update failed");
        err.statusCode = 409;
        throw err;
      }

      const vehicleUpdated = await tx.vehicles.updateMany({
        where: {
          id: wo.vehicle_id,
          company_id: companyId,
        },
        data: {
          status: "AVAILABLE",
          updated_at: now,
        },
      });

      if (vehicleUpdated.count !== 1) {
        const err = new Error("Vehicle update failed");
        err.statusCode = 409;
        throw err;
      }

      await tx.maintenance_work_order_events.create({
        data: {
          company_id: companyId,
          work_order_id: workOrderId,
          event_type: "COMPLETE",
          actor_id: userId,
          notes: notes ? String(notes) : null,
          payload: null,
          created_at: now,
        },
      });

      return tx.maintenance_work_orders.findFirst({
        where: {
          id: workOrderId,
          company_id: companyId,
        },
      });
    });

    return res.json({ message: "Work order completed", work_order: updated });
  } catch (e) {
    const sc = e?.statusCode || 500;
    if (sc !== 500) {
      return res.status(sc).json({ message: e.message });
    }

    console.error("COMPLETE WORK ORDER ERROR:", e);
    return res.status(500).json({ message: "Failed to complete work order", error: e.message });
  }
}

module.exports = {
  listWorkOrders,
  getWorkOrderById,
  getWorkOrderReport,
  upsertPostReport,
  completeWorkOrder,
};