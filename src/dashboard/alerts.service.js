// =======================
// src/dashboard/alerts.service.js
// =======================

const prisma = require("../prisma");
const { DateTime } = require("luxon");

const CAIRO_TZ = "Africa/Cairo";

function roleUpper(r) {
  return String(r || "").toUpperCase();
}

function isSupervisorRole(role) {
  return roleUpper(role) === "FIELD_SUPERVISOR";
}

function isAdminOrHR(role) {
  const r = roleUpper(role);
  return r === "ADMIN" || r === "HR";
}

function normalizeUuidOrNull(v) {
  if (!v || String(v).trim() === "") return null;
  return String(v).trim();
}

function toMoneyNumber(v) {
  return Number(Number(v ?? 0).toFixed(2));
}

function toJsDate(v) {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

function daysBetweenCairo(fromDate, toDate) {
  const from = DateTime.fromJSDate(toJsDate(fromDate), { zone: CAIRO_TZ }).startOf("day");
  const to = DateTime.fromJSDate(toJsDate(toDate), { zone: CAIRO_TZ }).startOf("day");
  return Math.round(to.diff(from, "days").days);
}

function severityRank(severity) {
  if (severity === "danger") return 3;
  if (severity === "warn") return 2;
  return 1;
}

function buildAlert({
  id,
  type,
  severity,
  area,
  title,
  message,
  entity_type,
  entity_id,
  href,
  created_at,
  meta,
  sort_order = 0,
}) {
  return {
    id,
    type,
    severity,
    area,
    title,
    message,
    entity_type,
    entity_id,
    href,
    created_at,
    meta: meta || {},
    _sort_order: Number(sort_order || 0),
  };
}

async function getOperationsAlerts({ user, clientId = null, siteId = null }) {
  const isSupervisor = isSupervisorRole(user?.role);

  let rows = [];
  if (!isSupervisor) {
    rows = await prisma.trips.findMany({
      where: {
        status: "COMPLETED",
        financial_closed_at: null,
        ...(clientId ? { client_id: clientId } : {}),
        ...(siteId ? { site_id: siteId } : {}),
      },
      select: {
        id: true,
        created_at: true,
        status: true,
        financial_status: true,
        financial_review_opened_at: true,
        clients: { select: { name: true } },
        sites: { select: { name: true } },
      },
      orderBy: { created_at: "asc" },
      take: 50,
    });
  } else {
    rows = await prisma.$queryRaw`
      SELECT
        t.id,
        t.created_at,
        t.status,
        t.financial_status,
        t.financial_review_opened_at,
        c.name AS client_name,
        s.name AS site_name
      FROM trips t
      JOIN trip_assignments ta
        ON ta.trip_id = t.id
       AND ta.is_active = true
      LEFT JOIN clients c
        ON c.id = t.client_id
      LEFT JOIN sites s
        ON s.id = t.site_id
      WHERE t.status = 'COMPLETED'
        AND t.financial_closed_at IS NULL
        AND ta.field_supervisor_id = ${user.id}::uuid
        AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
        AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
      ORDER BY t.created_at ASC
      LIMIT 50;
    `;
  }

  return (rows || []).map((r) => {
    const createdAt = toJsDate(r.created_at);
    const ageDays = createdAt ? daysBetweenCairo(createdAt, new Date()) : 0;

    return buildAlert({
      id: `TRIP_FIN_CLOSE:${r.id}`,
      type: "TRIP_FINANCE_CLOSE_PENDING",
      severity: "danger",
      area: "operations",
      title: "رحلة تحتاج إغلاق مالي",
      message: `الرحلة ${String(r.id).slice(0, 8)} تحتاج إغلاق مالي${r.client_name || r.clients?.name ? ` — العميل ${r.client_name || r.clients?.name}` : ""}`,
      entity_type: "trip",
      entity_id: r.id,
      href: `/trips/${r.id}`,
      created_at: createdAt || new Date(),
      meta: {
        trip_id: r.id,
        client: r.client_name || r.clients?.name || null,
        site: r.site_name || r.sites?.name || null,
        financial_status: r.financial_status || null,
        age_days: ageDays,
      },
      sort_order: ageDays,
    });
  });
}

async function getFinanceAlerts({ clientId = null }) {
  const alerts = [];

  const nowCairo = DateTime.now().setZone(CAIRO_TZ);
  const todayStartCairo = nowCairo.startOf("day");
  const dueSoonEndExclusiveCairo = todayStartCairo.plus({ days: 8 });

  const invoiceRows = await prisma.$queryRaw`
    SELECT
      i.id,
      i.invoice_no,
      i.client_id,
      i.issue_date,
      i.due_date,
      i.total_amount::numeric AS total_amount,
      i.status,
      c.name AS client_name,
      COALESCE(SUM(a.amount_allocated), 0)::numeric AS allocated_amount
    FROM ar_invoices i
    LEFT JOIN ar_payment_allocations a
      ON a.invoice_id = i.id
    LEFT JOIN clients c
      ON c.id = i.client_id
    WHERE i.status IN ('APPROVED', 'PARTIALLY_PAID')
      AND i.due_date IS NOT NULL
      AND (${clientId}::uuid IS NULL OR i.client_id = ${clientId}::uuid)
    GROUP BY
      i.id,
      i.invoice_no,
      i.client_id,
      i.issue_date,
      i.due_date,
      i.total_amount,
      i.status,
      c.name
    ORDER BY i.due_date ASC;
  `;

  for (const r of invoiceRows || []) {
    const dueDate = toJsDate(r.due_date);
    if (!dueDate) continue;

    const totalAmount = Number(r.total_amount ?? 0);
    const allocatedAmount = Number(r.allocated_amount ?? 0);
    const outstandingAmount = totalAmount - allocatedAmount;
    if (!(outstandingAmount > 0)) continue;

    const dueDateCairo = DateTime.fromJSDate(dueDate, { zone: CAIRO_TZ }).startOf("day");

    if (dueDateCairo < todayStartCairo) {
      const daysOverdue = daysBetweenCairo(dueDate, new Date());
      alerts.push(
        buildAlert({
          id: `AR_OVERDUE:${r.id}`,
          type: "AR_OVERDUE",
          severity: "danger",
          area: "finance",
          title: "فاتورة عميل متأخرة",
          message: `الفاتورة ${r.invoice_no} للعميل ${r.client_name || "—"} متأخرة ${daysOverdue} يوم`,
          entity_type: "invoice",
          entity_id: r.id,
          href: "/finance/ar/invoices",
          created_at: dueDate,
          meta: {
            invoice_no: r.invoice_no,
            client_id: r.client_id,
            client_name: r.client_name || null,
            due_date: r.due_date,
            total_amount: toMoneyNumber(totalAmount),
            allocated_amount: toMoneyNumber(allocatedAmount),
            outstanding_amount: toMoneyNumber(outstandingAmount),
            status: r.status,
            days_overdue: daysOverdue,
          },
          sort_order: daysOverdue,
        })
      );
      continue;
    }

    if (dueDateCairo >= todayStartCairo && dueDateCairo < dueSoonEndExclusiveCairo) {
      const daysToDue = daysBetweenCairo(new Date(), dueDate);
      alerts.push(
        buildAlert({
          id: `AR_DUE_SOON:${r.id}`,
          type: "AR_DUE_SOON",
          severity: "warn",
          area: "finance",
          title: "فاتورة عميل مستحقة قريبًا",
          message: `الفاتورة ${r.invoice_no} للعميل ${r.client_name || "—"} تستحق خلال ${daysToDue} يوم`,
          entity_type: "invoice",
          entity_id: r.id,
          href: "/finance/ar/invoices",
          created_at: dueDate,
          meta: {
            invoice_no: r.invoice_no,
            client_id: r.client_id,
            client_name: r.client_name || null,
            due_date: r.due_date,
            total_amount: toMoneyNumber(totalAmount),
            allocated_amount: toMoneyNumber(allocatedAmount),
            outstanding_amount: toMoneyNumber(outstandingAmount),
            status: r.status,
            days_to_due: daysToDue,
          },
          sort_order: 1000 - daysToDue,
        })
      );
    }
  }

  const pending48h = nowCairo.minus({ hours: 48 }).toJSDate();
  const pendingExpenses = await prisma.cash_expenses.findMany({
    where: {
      approval_status: "PENDING",
      created_at: { lt: pending48h },
    },
    select: {
      id: true,
      amount: true,
      expense_type: true,
      created_at: true,
      trip_id: true,
      vehicle_id: true,
      cash_advance_id: true,
    },
    orderBy: { created_at: "asc" },
    take: 50,
  });

  for (const e of pendingExpenses || []) {
    const ageDays = daysBetweenCairo(e.created_at, new Date());
    alerts.push(
      buildAlert({
        id: `EXPENSE_PENDING_TOO_LONG:${e.id}`,
        type: "EXPENSE_PENDING_TOO_LONG",
        severity: "warn",
        area: "finance",
        title: "مصروف معلق لفترة طويلة",
        message: `مصروف ${e.expense_type || "—"} بقيمة ${toMoneyNumber(e.amount)} ما زال معلقًا منذ ${ageDays} يوم`,
        entity_type: "expense",
        entity_id: e.id,
        href: `/finance/expenses/${e.id}`,
        created_at: e.created_at,
        meta: {
          amount: toMoneyNumber(e.amount),
          expense_type: e.expense_type,
          age_days: ageDays,
          trip_id: e.trip_id,
          vehicle_id: e.vehicle_id,
          cash_advance_id: e.cash_advance_id,
        },
        sort_order: ageDays,
      })
    );
  }

  const advance7d = nowCairo.minus({ days: 7 }).toJSDate();
  const openAdvances = await prisma.cash_advances.findMany({
    where: {
      status: { in: ["OPEN", "IN_REVIEW"] },
      created_at: { lt: advance7d },
    },
    select: {
      id: true,
      amount: true,
      status: true,
      created_at: true,
      field_supervisor_id: true,
    },
    orderBy: { created_at: "asc" },
    take: 50,
  });

  for (const a of openAdvances || []) {
    const ageDays = daysBetweenCairo(a.created_at, new Date());
    alerts.push(
      buildAlert({
        id: `ADVANCE_OPEN_TOO_LONG:${a.id}`,
        type: "ADVANCE_OPEN_TOO_LONG",
        severity: "warn",
        area: "finance",
        title: "سلفة مفتوحة لفترة طويلة",
        message: `السلفة ${String(a.id).slice(0, 8)} ما زالت مفتوحة منذ ${ageDays} يوم`,
        entity_type: "advance",
        entity_id: a.id,
        href: `/finance/advances/${a.id}`,
        created_at: a.created_at,
        meta: {
          amount: toMoneyNumber(a.amount),
          status: a.status,
          age_days: ageDays,
          field_supervisor_id: a.field_supervisor_id,
        },
        sort_order: ageDays,
      })
    );
  }

  return alerts;
}

async function getMaintenanceAlerts() {
  const alerts = [];

  const openWorkOrders = await prisma.maintenance_work_orders.findMany({
    where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    select: {
      id: true,
      status: true,
      opened_at: true,
      updated_at: true,
      vehicle_id: true,
      type: true,
    },
    orderBy: { updated_at: "asc" },
    take: 50,
  });

  for (const wo of openWorkOrders || []) {
    const baseDate = wo.opened_at || wo.updated_at || new Date();
    const ageDays = daysBetweenCairo(baseDate, new Date());
    alerts.push(
      buildAlert({
        id: `MAINT_OPEN_WO:${wo.id}`,
        type: "MAINTENANCE_OPEN_WORK_ORDER",
        severity: "warn",
        area: "maintenance",
        title: "أمر عمل مفتوح",
        message: `أمر العمل ${String(wo.id).slice(0, 8)} ما زال مفتوحًا منذ ${ageDays} يوم`,
        entity_type: "work_order",
        entity_id: wo.id,
        href: `/maintenance/work-orders/${wo.id}`,
        created_at: baseDate,
        meta: {
          status: wo.status,
          vehicle_id: wo.vehicle_id,
          type: wo.type,
          age_days: ageDays,
        },
        sort_order: ageDays,
      })
    );
  }

  const qaNeedsRows = await prisma.$queryRaw`
    SELECT
      wo.id,
      wo.completed_at,
      wo.updated_at,
      wo.vehicle_id
    FROM maintenance_work_orders wo
    LEFT JOIN post_maintenance_reports pr
      ON pr.work_order_id = wo.id
    WHERE wo.status = 'COMPLETED'
      AND pr.id IS NULL
    ORDER BY COALESCE(wo.completed_at, wo.updated_at) ASC
    LIMIT 50;
  `;

  for (const r of qaNeedsRows || []) {
    const when = toJsDate(r.completed_at || r.updated_at || new Date());
    const ageDays = daysBetweenCairo(when, new Date());

    alerts.push(
      buildAlert({
        id: `MAINT_QA_NEEDS:${r.id}`,
        type: "MAINTENANCE_QA_NEEDS",
        severity: "warn",
        area: "maintenance",
        title: "أمر عمل يحتاج QA",
        message: `أمر العمل ${String(r.id).slice(0, 8)} مكتمل بدون تقرير ما بعد الصيانة`,
        entity_type: "work_order",
        entity_id: r.id,
        href: `/maintenance/work-orders/${r.id}`,
        created_at: when,
        meta: {
          vehicle_id: r.vehicle_id,
          age_days: ageDays,
        },
        sort_order: ageDays,
      })
    );
  }

  const qaFailedRows = await prisma.$queryRaw`
    SELECT
      wo.id,
      pr.checked_at,
      wo.vehicle_id,
      pr.road_test_result
    FROM post_maintenance_reports pr
    JOIN maintenance_work_orders wo
      ON wo.id = pr.work_order_id
    WHERE pr.road_test_result = 'FAIL'
    ORDER BY COALESCE(pr.checked_at, wo.updated_at) ASC
    LIMIT 50;
  `;

  for (const r of qaFailedRows || []) {
    const when = toJsDate(r.checked_at || new Date());
    const ageDays = daysBetweenCairo(when, new Date());

    alerts.push(
      buildAlert({
        id: `MAINT_QA_FAILED:${r.id}`,
        type: "MAINTENANCE_QA_FAILED",
        severity: "danger",
        area: "maintenance",
        title: "QA فشل",
        message: `أمر العمل ${String(r.id).slice(0, 8)} لديه نتيجة QA = FAIL`,
        entity_type: "work_order",
        entity_id: r.id,
        href: `/maintenance/work-orders/${r.id}`,
        created_at: when,
        meta: {
          vehicle_id: r.vehicle_id,
          road_test_result: r.road_test_result,
          age_days: ageDays,
        },
        sort_order: ageDays,
      })
    );
  }

  const mismatchRows = await prisma.$queryRaw`
    WITH issued AS (
      SELECT i.work_order_id, l.part_id, COALESCE(SUM(l.qty), 0)::numeric AS issued_qty
      FROM inventory_issues i
      JOIN inventory_issue_lines l ON l.issue_id = i.id
      GROUP BY i.work_order_id, l.part_id
    ),
    installed AS (
      SELECT ins.work_order_id, ins.part_id, COALESCE(SUM(ins.qty_installed), 0)::numeric AS installed_qty
      FROM work_order_installations ins
      GROUP BY ins.work_order_id, ins.part_id
    ),
    diff AS (
      SELECT
        COALESCE(issued.work_order_id, installed.work_order_id) AS work_order_id,
        COALESCE(issued.part_id, installed.part_id) AS part_id,
        COALESCE(issued.issued_qty, 0)::numeric AS issued_qty,
        COALESCE(installed.installed_qty, 0)::numeric AS installed_qty
      FROM issued
      FULL OUTER JOIN installed
        ON issued.work_order_id = installed.work_order_id
       AND issued.part_id = installed.part_id
    )
    SELECT
      d.work_order_id AS id,
      wo.updated_at,
      wo.vehicle_id,
      COUNT(*)::int AS mismatch_lines
    FROM diff d
    JOIN maintenance_work_orders wo ON wo.id = d.work_order_id
    WHERE wo.status = 'COMPLETED'
      AND (d.issued_qty <> d.installed_qty)
    GROUP BY d.work_order_id, wo.updated_at, wo.vehicle_id
    ORDER BY wo.updated_at ASC
    LIMIT 50;
  `;

  for (const r of mismatchRows || []) {
    const when = toJsDate(r.updated_at || new Date());
    const ageDays = daysBetweenCairo(when, new Date());

    alerts.push(
      buildAlert({
        id: `MAINT_PARTS_MISMATCH:${r.id}`,
        type: "MAINTENANCE_PARTS_MISMATCH",
        severity: "danger",
        area: "maintenance",
        title: "عدم تطابق قطع",
        message: `أمر العمل ${String(r.id).slice(0, 8)} لديه فروقات بين المصروف والمركب`,
        entity_type: "work_order",
        entity_id: r.id,
        href: `/maintenance/work-orders/${r.id}`,
        created_at: when,
        meta: {
          vehicle_id: r.vehicle_id,
          mismatch_lines: Number(r.mismatch_lines ?? 0),
          age_days: ageDays,
        },
        sort_order: Number(r.mismatch_lines ?? 0) * 100 + ageDays,
      })
    );
  }

  return alerts;
}

async function getComplianceAlerts() {
  const alerts = [];
  const now = new Date();

  const daysWindow = 30;
  const until = new Date(now);
  until.setDate(until.getDate() + daysWindow);

  const [vehiclesExpiring, vehiclesExpired, driversExpiring, driversExpired] =
    await Promise.all([
      prisma.vehicles.findMany({
        where: {
          license_expiry_date: {
            not: null,
            gte: now,
            lte: until,
          },
        },
        orderBy: { license_expiry_date: "asc" },
        take: 50,
        select: {
          id: true,
          fleet_no: true,
          plate_no: true,
          display_name: true,
          license_no: true,
          license_expiry_date: true,
          supervisor_id: true,
        },
      }),
      prisma.vehicles.findMany({
        where: {
          license_expiry_date: {
            not: null,
            lt: now,
          },
        },
        orderBy: { license_expiry_date: "asc" },
        take: 50,
        select: {
          id: true,
          fleet_no: true,
          plate_no: true,
          display_name: true,
          license_no: true,
          license_expiry_date: true,
          supervisor_id: true,
        },
      }),
      prisma.drivers.findMany({
        where: {
          license_expiry_date: {
            not: null,
            gte: now,
            lte: until,
          },
        },
        orderBy: { license_expiry_date: "asc" },
        take: 50,
        select: {
          id: true,
          full_name: true,
          phone: true,
          phone2: true,
          national_id: true,
          license_no: true,
          license_expiry_date: true,
        },
      }),
      prisma.drivers.findMany({
        where: {
          license_expiry_date: {
            not: null,
            lt: now,
          },
        },
        orderBy: { license_expiry_date: "asc" },
        take: 50,
        select: {
          id: true,
          full_name: true,
          phone: true,
          phone2: true,
          national_id: true,
          license_no: true,
          license_expiry_date: true,
        },
      }),
    ]);

  for (const v of vehiclesExpired || []) {
    const daysOverdue = daysBetweenCairo(v.license_expiry_date, now);
    const label = [v.fleet_no, v.plate_no].filter(Boolean).join(" - ") || v.display_name || String(v.id).slice(0, 8);

    alerts.push(
      buildAlert({
        id: `VEHICLE_LICENSE_EXPIRED:${v.id}`,
        type: "VEHICLE_LICENSE_EXPIRED",
        severity: "danger",
        area: "compliance",
        title: "رخصة مركبة منتهية",
        message: `المركبة ${label} رخصتها منتهية منذ ${daysOverdue} يوم`,
        entity_type: "vehicle",
        entity_id: v.id,
        href: `/vehicles/${v.id}`,
        created_at: v.license_expiry_date,
        meta: {
          fleet_no: v.fleet_no,
          plate_no: v.plate_no,
          display_name: v.display_name,
          license_no: v.license_no,
          license_expiry_date: v.license_expiry_date,
          supervisor_id: v.supervisor_id,
          days_overdue: daysOverdue,
        },
        sort_order: daysOverdue,
      })
    );
  }

  for (const v of vehiclesExpiring || []) {
    const daysToDue = daysBetweenCairo(now, v.license_expiry_date);
    const label = [v.fleet_no, v.plate_no].filter(Boolean).join(" - ") || v.display_name || String(v.id).slice(0, 8);

    alerts.push(
      buildAlert({
        id: `VEHICLE_LICENSE_EXPIRING:${v.id}`,
        type: "VEHICLE_LICENSE_EXPIRING",
        severity: "warn",
        area: "compliance",
        title: "رخصة مركبة تقترب من الانتهاء",
        message: `المركبة ${label} رخصتها تنتهي خلال ${daysToDue} يوم`,
        entity_type: "vehicle",
        entity_id: v.id,
        href: `/vehicles/${v.id}`,
        created_at: v.license_expiry_date,
        meta: {
          fleet_no: v.fleet_no,
          plate_no: v.plate_no,
          display_name: v.display_name,
          license_no: v.license_no,
          license_expiry_date: v.license_expiry_date,
          supervisor_id: v.supervisor_id,
          days_to_due: daysToDue,
        },
        sort_order: 1000 - daysToDue,
      })
    );
  }

  for (const d of driversExpired || []) {
    const daysOverdue = daysBetweenCairo(d.license_expiry_date, now);

    alerts.push(
      buildAlert({
        id: `DRIVER_LICENSE_EXPIRED:${d.id}`,
        type: "DRIVER_LICENSE_EXPIRED",
        severity: "danger",
        area: "compliance",
        title: "رخصة سائق منتهية",
        message: `رخصة السائق ${d.full_name || "—"} منتهية منذ ${daysOverdue} يوم`,
        entity_type: "driver",
        entity_id: d.id,
        href: `/drivers/${d.id}`,
        created_at: d.license_expiry_date,
        meta: {
          full_name: d.full_name,
          phone: d.phone,
          phone2: d.phone2,
          national_id: d.national_id,
          license_no: d.license_no,
          license_expiry_date: d.license_expiry_date,
          days_overdue: daysOverdue,
        },
        sort_order: daysOverdue,
      })
    );
  }

  for (const d of driversExpiring || []) {
    const daysToDue = daysBetweenCairo(now, d.license_expiry_date);

    alerts.push(
      buildAlert({
        id: `DRIVER_LICENSE_EXPIRING:${d.id}`,
        type: "DRIVER_LICENSE_EXPIRING",
        severity: "warn",
        area: "compliance",
        title: "رخصة سائق تقترب من الانتهاء",
        message: `رخصة السائق ${d.full_name || "—"} تنتهي خلال ${daysToDue} يوم`,
        entity_type: "driver",
        entity_id: d.id,
        href: `/drivers/${d.id}`,
        created_at: d.license_expiry_date,
        meta: {
          full_name: d.full_name,
          phone: d.phone,
          phone2: d.phone2,
          national_id: d.national_id,
          license_no: d.license_no,
          license_expiry_date: d.license_expiry_date,
          days_to_due: daysToDue,
        },
        sort_order: 1000 - daysToDue,
      })
    );
  }

  return alerts;
}

exports.getAlerts = async (user, filters = {}) => {
  const limit = Math.min(200, Math.max(1, Number(filters.limit || 50)));
  const area = filters.area ? String(filters.area).toLowerCase() : null;

  const clientId = normalizeUuidOrNull(filters.clientId);
  const siteId = normalizeUuidOrNull(filters.siteId);

  const areas = area
    ? [area]
    : ["operations", "finance", "maintenance", ...(isAdminOrHR(user?.role) ? ["compliance"] : [])];

  const parts = await Promise.all([
    areas.includes("operations")
      ? getOperationsAlerts({ user, clientId, siteId })
      : Promise.resolve([]),
    areas.includes("finance")
      ? getFinanceAlerts({ clientId })
      : Promise.resolve([]),
    areas.includes("maintenance")
      ? getMaintenanceAlerts()
      : Promise.resolve([]),
    areas.includes("compliance")
      ? getComplianceAlerts()
      : Promise.resolve([]),
  ]);

  const items = parts.flat();

  items.sort((a, b) => {
    const sr = severityRank(b.severity) - severityRank(a.severity);
    if (sr !== 0) return sr;

    const so = Number(b._sort_order || 0) - Number(a._sort_order || 0);
    if (so !== 0) return so;

    const ad = new Date(a.created_at).getTime();
    const bd = new Date(b.created_at).getTime();
    return bd - ad;
  });

  const finalItems = items.slice(0, limit).map((x) => {
    const { _sort_order, ...rest } = x;
    return rest;
  });

  return {
    total: items.length,
    items: finalItems,
  };
};

exports.getAlertsSummary = async (user, filters = {}) => {
  const data = await exports.getAlerts(user, {
    ...filters,
    limit: 500,
  });

  const out = {
    total: Number(data.total || 0),
    by_severity: {
      danger: 0,
      warn: 0,
      info: 0,
    },
    by_area: {
      operations: 0,
      finance: 0,
      maintenance: 0,
      compliance: 0,
    },
  };

  for (const a of data.items || []) {
    if (out.by_severity[a.severity] != null) out.by_severity[a.severity] += 1;
    if (out.by_area[a.area] != null) out.by_area[a.area] += 1;
  }

  return out;
};