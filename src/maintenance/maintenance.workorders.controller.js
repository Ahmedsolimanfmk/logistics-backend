// =======================
// src/maintenance/maintenance.workorders.controller.js
// FULL: listWorkOrders + getWorkOrderById + getWorkOrderReport + upsertPostReport + completeWorkOrder
// =======================

const prisma = require("../prisma");

// ---------- helpers ----------
function getAuthUserId(req) {
  return req?.user?.sub || req?.user?.id || req?.user?.userId || null;
}
function roleUpper(r) {
  return String(r || "").toUpperCase();
}
function isAdminOrAccountant(role) {
  const rr = roleUpper(role);
  return rr === "ADMIN" || rr === "ACCOUNTANT";
}
function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

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

// =======================
// Runtime Aggregation Helper
// =======================
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

// =======================
// GET /maintenance/work-orders
// Query:
//  page, limit
//  status, vehicle_id, request_id
//  q (search vendor/notes)
// =======================
async function listWorkOrders(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // (اختياري) تقييد الرؤية
    // لو عايز تعرض للجميع: سيبها
    // لو عايز Admin/Accountant فقط:
    // const role = req.user?.role || null;
    // if (!isAdminOrAccountant(role)) return res.status(403).json({ message: "Forbidden" });

    const page = Math.max(1, parseIntQuery(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, parseIntQuery(req.query.limit, 20)));
    const skip = (page - 1) * limit;

    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    const vehicle_id = req.query.vehicle_id ? String(req.query.vehicle_id) : null;
    const request_id = req.query.request_id ? String(req.query.request_id) : null;
    const q = req.query.q ? String(req.query.q).trim() : "";

    const where = {};

    if (status) where.status = status;
    if (vehicle_id) {
      if (!isUuid(vehicle_id)) return res.status(400).json({ message: "Invalid vehicle_id" });
      where.vehicle_id = vehicle_id;
    }

    // لو عندك request_id في جدول work_orders (زي اللي عملته في CloudSQL)
    if (request_id) {
      if (!isUuid(request_id)) return res.status(400).json({ message: "Invalid request_id" });
      where.request_id = request_id;
    }

    if (q) {
      where.OR = [
        { vendor_name: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } },
        // ابقى زود search على أي fields تحبها
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
          status: true,
          type: true,
          vendor_name: true,
          opened_at: true,
          started_at: true,
          completed_at: true,
          odometer: true,
          notes: true,
          vehicle_id: true,

          // لو موجود
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
    return res.status(500).json({ message: "Failed to list work orders" });
  }
}

// =======================
// GET /maintenance/work-orders/:id
// (تفاصيل مختصرة - غير report)
// =======================
async function getWorkOrderById(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const id = String(req.params.id || "");
    if (!isUuid(id)) return res.status(400).json({ message: "Invalid work order id" });

    const row = await prisma.maintenance_work_orders.findUnique({
      where: { id },
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
        post_maintenance_reports: true,
      },
    });

    if (!row) return res.status(404).json({ message: "Work order not found" });

    return res.json({ work_order: row });
  } catch (e) {
    console.error("GET WORK ORDER ERROR:", e);
    return res.status(500).json({ message: "Failed to get work order" });
  }
}

// =======================
// GET /maintenance/work-orders/:id/report
// =======================
async function getWorkOrderReport(req, res) {
  try {
    const workOrderId = req.params.id;
    if (!isUuid(workOrderId)) {
      return res.status(400).json({ message: "Invalid work order id" });
    }

    const woFull = await prisma.maintenance_work_orders.findUnique({
      where: { id: workOrderId },
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
        inventory_issues: {
          include: {
            inventory_issue_lines: {
              include: {
                parts: {
                  select: { id: true, name: true, part_number: true, brand: true, unit: true },
                },
              },
            },
          },
        },
        work_order_installations: {
          include: {
            parts: { select: { id: true, name: true, part_number: true, brand: true, unit: true } },
          },
        },
        post_maintenance_reports: true,

        // ✅ IMPORTANT: bring all WO-linked expenses (company or supervisor)
        cash_expenses: {
          where: { maintenance_work_order_id: workOrderId },
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
            expense_source: true,
            payer: true,
            created_at: true,
            created_by: true,
            cash_advance_id: true,
          },
        },
      },
    });

    if (!woFull) {
      return res.status(404).json({ message: "Work order not found" });
    }

    const report_runtime = buildRuntimeReport(woFull);
    const totals = report_runtime.totals;

    const woExpenses = woFull.cash_expenses || [];

    // totals by approval
    const approvedExpenses = woExpenses.filter(
      (e) => String(e.approval_status || "").toUpperCase() === "APPROVED"
    );

    const maintenance_cash_cost_total = round2(
      approvedExpenses.reduce((s, e) => s + toNum(e.amount), 0)
    );

    // split (optional but useful)
    const approved_company_total = round2(
      approvedExpenses
        .filter((e) => String(e.payer || "").toUpperCase() === "COMPANY_ACCOUNT")
        .reduce((s, e) => s + toNum(e.amount), 0)
    );

    const approved_supervisor_total = round2(
      approvedExpenses
        .filter((e) => String(e.payer || "").toUpperCase() === "SUPERVISOR_CASH")
        .reduce((s, e) => s + toNum(e.amount), 0)
    );

    totals.maintenance_cash_cost_total = maintenance_cash_cost_total;
    totals.maintenance_company_cost_total = approved_company_total;
    totals.maintenance_supervisor_cost_total = approved_supervisor_total;

    totals.grand_total = round2(
      totals.parts_cost_total + totals.labor_cost + totals.service_cost + maintenance_cash_cost_total
    );

    const mismatchCount =
      totals.mismatch_counts.issued_not_installed + totals.mismatch_counts.installed_not_issued;

    let report_status = "OK";
    if (mismatchCount > 0) report_status = "NEEDS_PARTS_RECONCILIATION";
    else if (!woFull.post_maintenance_reports) report_status = "NEEDS_QA";
    else if (String(woFull.post_maintenance_reports?.road_test_result || "").toUpperCase() === "FAIL") {
      report_status = "QA_FAILED";
    }

    return res.json({
      message: "Work order report",
      report_status,
      work_order: {
        id: woFull.id,
        status: woFull.status,
        type: woFull.type,
        vendor_name: woFull.vendor_name,
        opened_at: woFull.opened_at,
        started_at: woFull.started_at,
        completed_at: woFull.completed_at,
        odometer: woFull.odometer,
        notes: woFull.notes,
        request_id: woFull.request_id ?? null,
      },
      vehicle: woFull.vehicles,
      post_report_db: woFull.post_maintenance_reports,
      work_order_expenses: woExpenses,
      report_runtime,
    });
  } catch (e) {
    console.error("GET WORK ORDER REPORT ERROR:", e);
    return res.status(500).json({ message: "Failed to get work order report" });
  }
}

// =======================
// POST /maintenance/work-orders/:id/post-report
// body: { road_test_result?, checklist_json?, remarks? }
// =======================
async function upsertPostReport(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = req.user?.role || null;
    if (!isAdminOrAccountant(role)) {
      return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can submit post report (for now)" });
    }

    const workOrderId = String(req.params.id || "");
    if (!isUuid(workOrderId)) return res.status(400).json({ message: "Invalid work order id" });

    const { road_test_result, checklist_json, remarks } = req.body || {};
    const now = new Date();

    const wo = await prisma.maintenance_work_orders.findUnique({
      where: { id: workOrderId },
      select: { id: true, status: true },
    });
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    const row = await prisma.post_maintenance_reports.upsert({
      where: { work_order_id: workOrderId },
      create: {
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
    console.error("UPSERT POST REPORT ERROR:", e);
    return res.status(500).json({ message: "Failed to save post report", error: e.message });
  }
}

// =======================
// POST /maintenance/work-orders/:id/complete
// body: { notes? }
// =======================
async function completeWorkOrder(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const role = req.user?.role || null;
    if (!isAdminOrAccountant(role)) {
      return res.status(403).json({ message: "Only ADMIN/ACCOUNTANT can complete work orders (for now)" });
    }

    const workOrderId = String(req.params.id || "");
    if (!isUuid(workOrderId)) return res.status(400).json({ message: "Invalid work order id" });

    const { notes } = req.body || {};
    const now = new Date();

    const wo = await prisma.maintenance_work_orders.findUnique({
      where: { id: workOrderId },
      select: { id: true, status: true, vehicle_id: true },
    });
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    const st = String(wo.status || "").toUpperCase();
    if (st === "COMPLETED") return res.status(409).json({ message: "Work order already completed" });
    if (st === "CANCELED") return res.status(409).json({ message: "Work order is canceled" });

    const updated = await prisma.$transaction(async (tx) => {
      const woUpdated = await tx.maintenance_work_orders.update({
        where: { id: workOrderId },
        data: {
          status: "COMPLETED",
          completed_at: now,
          updated_at: now,
          notes: notes ? String(notes) : undefined,
        },
      });

      await tx.vehicles.update({
        where: { id: wo.vehicle_id },
        data: { status: "AVAILABLE", updated_at: now },
      });

      // optional log
      await tx.maintenance_work_order_events.create({
        data: {
          work_order_id: workOrderId,
          event_type: "COMPLETE",
          actor_id: userId,
          notes: notes ? String(notes) : null,
          payload: null,
          created_at: now,
        },
      });

      return woUpdated;
    });

    return res.json({ message: "Work order completed", work_order: updated });
  } catch (e) {
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
