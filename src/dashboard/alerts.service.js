// =======================
// src/dashboard/alerts.service.js
// tenant-safe version
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
  const from = DateTime.fromJSDate(toJsDate(fromDate), {
    zone: CAIRO_TZ,
  }).startOf("day");

  const to = DateTime.fromJSDate(toJsDate(toDate), {
    zone: CAIRO_TZ,
  }).startOf("day");

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
    alert_key: id,
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
    is_read: false,
    read_at: null,
    _sort_order: Number(sort_order || 0),
  };
}

async function getOperationsAlerts({
  companyId,
  user,
  clientId = null,
  siteId = null,
}) {
  const isSupervisor = isSupervisorRole(user?.role);
  const userId = user?.id || user?.sub || user?.userId || null;

  const rows = await prisma.$queryRaw`
    SELECT
      t.id,
      t.created_at,
      t.status,
      t.financial_status,
      t.financial_review_opened_at,
      c.name AS client_name,
      s.name AS site_name
    FROM trips t
    LEFT JOIN trip_assignments ta
      ON ta.trip_id = t.id
     AND ta.company_id = ${companyId}::uuid
     AND ta.is_active = true
    LEFT JOIN clients c
      ON c.id = t.client_id
     AND c.company_id = ${companyId}::uuid
    LEFT JOIN sites s
      ON s.id = t.site_id
     AND s.company_id = ${companyId}::uuid
    WHERE t.company_id = ${companyId}::uuid
      AND t.status = 'COMPLETED'
      AND t.financial_closed_at IS NULL
      AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
      AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
      AND (${isSupervisor}::boolean = false OR ta.field_supervisor_id = ${userId}::uuid)
    ORDER BY t.created_at ASC
    LIMIT 50;
  `;

  return (rows || []).map((r) => {
    const createdAt = toJsDate(r.created_at);
    const ageDays = createdAt ? daysBetweenCairo(createdAt, new Date()) : 0;

    return buildAlert({
      id: `TRIP_FIN_CLOSE:${r.id}`,
      type: "TRIP_FINANCE_CLOSE_PENDING",
      severity: "danger",
      area: "operations",
      title: "رحلة تحتاج إغلاق مالي",
      message: `الرحلة ${String(r.id).slice(0, 8)} تحتاج إغلاق مالي${
        r.client_name ? ` — العميل ${r.client_name}` : ""
      }`,
      entity_type: "trip",
      entity_id: r.id,
      href: `/trips/${r.id}`,
      created_at: createdAt || new Date(),
      meta: {
        trip_id: r.id,
        client: r.client_name || null,
        site: r.site_name || null,
        financial_status: r.financial_status || null,
        age_days: ageDays,
      },
      sort_order: ageDays,
    });
  });
}

async function getFinanceAlerts({ companyId, clientId = null }) {
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
      COALESCE(
        SUM(
          CASE
            WHEN p.status = 'POSTED' THEN a.amount_allocated
            ELSE 0
          END
        ),
        0
      )::numeric AS allocated_amount
    FROM ar_invoices i
    LEFT JOIN ar_payment_allocations a
      ON a.invoice_id = i.id
    LEFT JOIN ar_payments p
      ON p.id = a.payment_id
     AND p.company_id = ${companyId}::uuid
    LEFT JOIN clients c
      ON c.id = i.client_id
     AND c.company_id = ${companyId}::uuid
    WHERE i.company_id = ${companyId}::uuid
      AND i.status IN ('APPROVED', 'PARTIALLY_PAID')
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

    const dueDateCairo = DateTime.fromJSDate(dueDate, {
      zone: CAIRO_TZ,
    }).startOf("day");

    if (dueDateCairo < todayStartCairo) {
      const daysOverdue = daysBetweenCairo(dueDate, new Date());

      alerts.push(
        buildAlert({
          id: `AR_OVERDUE:${r.id}`,
          type: "AR_OVERDUE",
          severity: "danger",
          area: "finance",
          title: "فاتورة عميل متأخرة",
          message: `الفاتورة ${r.invoice_no} للعميل ${
            r.client_name || "—"
          } متأخرة ${daysOverdue} يوم`,
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

    if (
      dueDateCairo >= todayStartCairo &&
      dueDateCairo < dueSoonEndExclusiveCairo
    ) {
      const daysToDue = daysBetweenCairo(new Date(), dueDate);

      alerts.push(
        buildAlert({
          id: `AR_DUE_SOON:${r.id}`,
          type: "AR_DUE_SOON",
          severity: "warn",
          area: "finance",
          title: "فاتورة عميل مستحقة قريبًا",
          message: `الفاتورة ${r.invoice_no} للعميل ${
            r.client_name || "—"
          } تستحق خلال ${daysToDue} يوم`,
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
      company_id: companyId,
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
        message: `مصروف ${e.expense_type || "—"} بقيمة ${toMoneyNumber(
          e.amount
        )} ما زال معلقًا منذ ${ageDays} يوم`,
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
      company_id: companyId,
      status: "OPEN",
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
        message: `السلفة ${String(a.id).slice(
          0,
          8
        )} ما زالت مفتوحة منذ ${ageDays} يوم`,
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

async function getMaintenanceAlerts(companyId) {
  const alerts = [];

  const openWorkOrders = await prisma.maintenance_work_orders.findMany({
    where: {
      company_id: companyId,
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
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
        message: `أمر العمل ${String(wo.id).slice(
          0,
          8
        )} ما زال مفتوحًا منذ ${ageDays} يوم`,
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
    WHERE wo.company_id = ${companyId}::uuid
      AND wo.status = 'COMPLETED'
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
        message: `أمر العمل ${String(r.id).slice(
          0,
          8
        )} مكتمل بدون تقرير ما بعد الصيانة`,
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
    WHERE wo.company_id = ${companyId}::uuid
      AND pr.road_test_result = 'FAIL'
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
        message: `أمر العمل ${String(r.id).slice(
          0,
          8
        )} لديه نتيجة QA = FAIL`,
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
      WHERE i.company_id = ${companyId}::uuid
      GROUP BY i.work_order_id, l.part_id
    ),
    installed AS (
      SELECT ins.work_order_id, ins.part_id, COALESCE(SUM(ins.qty_installed), 0)::numeric AS installed_qty
      FROM work_order_installations ins
      WHERE ins.company_id = ${companyId}::uuid
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
    WHERE wo.company_id = ${companyId}::uuid
      AND wo.status = 'COMPLETED'
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
        message: `أمر العمل ${String(r.id).slice(
          0,
          8
        )} لديه فروقات بين المصروف والمركب`,
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

async function getComplianceSnapshot(companyId, options = {}) {
  const daysWindow = Math.min(
    365,
    Math.max(1, Number(options.daysWindow || 30))
  );

  const limit = Math.min(200, Math.max(1, Number(options.limit || 50)));

  const now = new Date();
  const until = new Date(now);
  until.setDate(until.getDate() + daysWindow);

  const [
    vehiclesExpiring,
    vehiclesExpired,
    vehiclesExpiringCount,
    vehiclesExpiredCount,
    driversExpiring,
    driversExpired,
    driversExpiringCount,
    driversExpiredCount,
  ] = await Promise.all([
    prisma.vehicles.findMany({
      where: {
        company_id: companyId,
        license_expiry_date: {
          not: null,
          gte: now,
          lte: until,
        },
      },
      orderBy: { license_expiry_date: "asc" },
      take: limit,
      select: {
        id: true,
        company_id: true,
        fleet_no: true,
        plate_no: true,
        display_name: true,
        status: true,
        license_no: true,
        license_issue_date: true,
        license_expiry_date: true,
        disable_reason: true,
        updated_at: true,
      },
    }),

    prisma.vehicles.findMany({
      where: {
        company_id: companyId,
        license_expiry_date: {
          not: null,
          lt: now,
        },
      },
      orderBy: { license_expiry_date: "desc" },
      take: limit,
      select: {
        id: true,
        company_id: true,
        fleet_no: true,
        plate_no: true,
        display_name: true,
        status: true,
        license_no: true,
        license_issue_date: true,
        license_expiry_date: true,
        disable_reason: true,
        updated_at: true,
      },
    }),

    prisma.vehicles.count({
      where: {
        company_id: companyId,
        license_expiry_date: {
          not: null,
          gte: now,
          lte: until,
        },
      },
    }),

    prisma.vehicles.count({
      where: {
        company_id: companyId,
        license_expiry_date: {
          not: null,
          lt: now,
        },
      },
    }),

    prisma.drivers.findMany({
      where: {
        company_id: companyId,
        license_expiry_date: {
          not: null,
          gte: now,
          lte: until,
        },
      },
      orderBy: { license_expiry_date: "asc" },
      take: limit,
      select: {
        id: true,
        company_id: true,
        full_name: true,
        phone: true,
        phone2: true,
        national_id: true,
        hire_date: true,
        license_no: true,
        license_issue_date: true,
        license_expiry_date: true,
        status: true,
        disable_reason: true,
        updated_at: true,
      },
    }),

    prisma.drivers.findMany({
      where: {
        company_id: companyId,
        license_expiry_date: {
          not: null,
          lt: now,
        },
      },
      orderBy: { license_expiry_date: "desc" },
      take: limit,
      select: {
        id: true,
        company_id: true,
        full_name: true,
        phone: true,
        phone2: true,
        national_id: true,
        hire_date: true,
        license_no: true,
        license_issue_date: true,
        license_expiry_date: true,
        status: true,
        disable_reason: true,
        updated_at: true,
      },
    }),

    prisma.drivers.count({
      where: {
        company_id: companyId,
        license_expiry_date: {
          not: null,
          gte: now,
          lte: until,
        },
      },
    }),

    prisma.drivers.count({
      where: {
        company_id: companyId,
        license_expiry_date: {
          not: null,
          lt: now,
        },
      },
    }),
  ]);

  const mapVehicleExpiring = vehiclesExpiring.map((v) => ({
    ...v,
    days_left: v.license_expiry_date
      ? daysBetweenCairo(now, v.license_expiry_date)
      : null,
  }));

  const mapVehicleExpired = vehiclesExpired.map((v) => ({
    ...v,
    days_overdue: v.license_expiry_date
      ? daysBetweenCairo(v.license_expiry_date, now)
      : null,
  }));

  const mapDriverExpiring = driversExpiring.map((d) => ({
    ...d,
    days_left: d.license_expiry_date
      ? daysBetweenCairo(now, d.license_expiry_date)
      : null,
  }));

  const mapDriverExpired = driversExpired.map((d) => ({
    ...d,
    days_overdue: d.license_expiry_date
      ? daysBetweenCairo(d.license_expiry_date, now)
      : null,
  }));

  return {
    range: { days: daysWindow, limit, now, until },
    counts: {
      vehicles: {
        expiring: vehiclesExpiringCount,
        expired: vehiclesExpiredCount,
      },
      drivers: {
        expiring: driversExpiringCount,
        expired: driversExpiredCount,
      },
    },
    items: {
      vehicles_expiring: mapVehicleExpiring,
      vehicles_expired: mapVehicleExpired,
      drivers_expiring: mapDriverExpiring,
      drivers_expired: mapDriverExpired,
    },
  };
}

async function getComplianceAlerts(companyId, options = {}) {
  const snapshot = await getComplianceSnapshot(companyId, {
    daysWindow: options.daysWindow || 30,
    limit: options.limit || 50,
  });

  const alerts = [];
  const now = new Date();

  for (const v of snapshot.items.vehicles_expired || []) {
    const daysOverdue = Number(v.days_overdue || 0);

    const label =
      [v.fleet_no, v.plate_no].filter(Boolean).join(" - ") ||
      v.display_name ||
      String(v.id).slice(0, 8);

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
        created_at: v.license_expiry_date || now,
        meta: {
          fleet_no: v.fleet_no,
          plate_no: v.plate_no,
          display_name: v.display_name,
          license_no: v.license_no,
          license_expiry_date: v.license_expiry_date,
          days_overdue: daysOverdue,
        },
        sort_order: daysOverdue,
      })
    );
  }

  for (const v of snapshot.items.vehicles_expiring || []) {
    const daysToDue = Number(v.days_left || 0);

    const label =
      [v.fleet_no, v.plate_no].filter(Boolean).join(" - ") ||
      v.display_name ||
      String(v.id).slice(0, 8);

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
        created_at: v.license_expiry_date || now,
        meta: {
          fleet_no: v.fleet_no,
          plate_no: v.plate_no,
          display_name: v.display_name,
          license_no: v.license_no,
          license_expiry_date: v.license_expiry_date,
          days_to_due: daysToDue,
        },
        sort_order: 1000 - daysToDue,
      })
    );
  }

  for (const d of snapshot.items.drivers_expired || []) {
    const daysOverdue = Number(d.days_overdue || 0);

    alerts.push(
      buildAlert({
        id: `DRIVER_LICENSE_EXPIRED:${d.id}`,
        type: "DRIVER_LICENSE_EXPIRED",
        severity: "danger",
        area: "compliance",
        title: "رخصة سائق منتهية",
        message: `رخصة السائق ${
          d.full_name || "—"
        } منتهية منذ ${daysOverdue} يوم`,
        entity_type: "driver",
        entity_id: d.id,
        href: `/drivers/${d.id}`,
        created_at: d.license_expiry_date || now,
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

  for (const d of snapshot.items.drivers_expiring || []) {
    const daysToDue = Number(d.days_left || 0);

    alerts.push(
      buildAlert({
        id: `DRIVER_LICENSE_EXPIRING:${d.id}`,
        type: "DRIVER_LICENSE_EXPIRING",
        severity: "warn",
        area: "compliance",
        title: "رخصة سائق تقترب من الانتهاء",
        message: `رخصة السائق ${
          d.full_name || "—"
        } تنتهي خلال ${daysToDue} يوم`,
        entity_type: "driver",
        entity_id: d.id,
        href: `/drivers/${d.id}`,
        created_at: d.license_expiry_date || now,
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

async function getTripBusinessAlerts({
  companyId,
  user,
  clientId = null,
  siteId = null,
}) {
  const isSupervisor = isSupervisorRole(user?.role);
  const userId = user?.id || user?.sub || user?.userId || null;

  const where = {
    company_id: companyId,
  };

  if (clientId) where.client_id = clientId;
  if (siteId) where.site_id = siteId;

  if (isSupervisor && userId) {
    where.trip_assignments = {
      some: {
        company_id: companyId,
        field_supervisor_id: userId,
      },
    };
  }

  const rows = await prisma.trips.findMany({
    where,
    select: {
      id: true,
      status: true,
      financial_status: true,
      client_id: true,
      site_id: true,
      trip_assignments: {
        where: {
          company_id: companyId,
          is_active: true,
        },
        select: {
          id: true,
        },
      },
      trip_revenues: {
        where: {
          company_id: companyId,
        },
        orderBy: {
          entered_at: "desc",
        },
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          entered_at: true,
        },
      },
      cash_expenses: {
        where: {
          company_id: companyId,
          approval_status: "APPROVED",
        },
        select: {
          amount: true,
        },
      },
      created_at: true,
    },
    orderBy: {
      created_at: "desc",
    },
    take: 200,
  });

  const alerts = [];

  for (const t of rows || []) {
    const hasAssignment = (t.trip_assignments || []).length > 0;

    const revenues = t.trip_revenues || [];

    const approvedRevenue =
      revenues.find(
        (r) => String(r.status || "").toUpperCase() === "APPROVED"
      ) || null;

    const totalExpenses = (t.cash_expenses || []).reduce(
      (s, e) => s + Number(e.amount || 0),
      0
    );

    if (!hasAssignment && t.status !== "CANCELLED") {
      alerts.push(
        buildAlert({
          id: `TRIP_NO_ASSIGNMENT:${t.id}`,
          type: "TRIP_NO_ASSIGNMENT",
          severity: "warn",
          area: "operations",
          title: "رحلة بدون تعيين",
          message: `الرحلة ${String(t.id).slice(0, 8)} بدون مركبة أو سائق`,
          entity_type: "trip",
          entity_id: t.id,
          href: `/trips/${t.id}`,
          created_at: t.created_at,
        })
      );
    }

    if (!approvedRevenue && t.status === "COMPLETED") {
      alerts.push(
        buildAlert({
          id: `TRIP_NO_REVENUE:${t.id}`,
          type: "TRIP_NO_REVENUE",
          severity: "danger",
          area: "finance",
          title: "رحلة بدون إيراد",
          message: `الرحلة ${String(t.id).slice(
            0,
            8
          )} لا يوجد لها إيراد معتمد`,
          entity_type: "trip",
          entity_id: t.id,
          href: `/trips/${t.id}`,
          created_at: t.created_at,
        })
      );
    }

    if (!approvedRevenue) continue;

    const revenueAmount = Number(approvedRevenue.amount || 0);
    const profit = revenueAmount - totalExpenses;

    const profitMarginPct =
      revenueAmount > 0 ? (profit / revenueAmount) * 100 : null;

    const costRatioPct =
      revenueAmount > 0 ? (totalExpenses / revenueAmount) * 100 : null;

    if (totalExpenses > revenueAmount) {
      alerts.push(
        buildAlert({
          id: `TRIP_LOSS:${t.id}`,
          type: "TRIP_LOSS",
          severity: "danger",
          area: "finance",
          title: "رحلة خاسرة",
          message: `الرحلة ${String(t.id).slice(0, 8)} تحقق خسارة`,
          entity_type: "trip",
          entity_id: t.id,
          href: `/trips/${t.id}`,
          created_at: t.created_at,
          meta: {
            revenue: toMoneyNumber(revenueAmount),
            expenses: toMoneyNumber(totalExpenses),
            profit: toMoneyNumber(profit),
          },
        })
      );
    }

    if (
      revenueAmount > 0 &&
      profit > 0 &&
      profitMarginPct !== null &&
      profitMarginPct < 10
    ) {
      alerts.push(
        buildAlert({
          id: `LOW_MARGIN_TRIP:${t.id}`,
          type: "LOW_MARGIN_TRIP",
          severity: "warn",
          area: "finance",
          title: "رحلة بهامش ربح منخفض",
          message: `الرحلة ${String(t.id).slice(
            0,
            8
          )} هامش ربحها منخفض (${profitMarginPct.toFixed(2)}%)`,
          entity_type: "trip",
          entity_id: t.id,
          href: `/trips/${t.id}`,
          created_at: t.created_at,
          meta: {
            revenue: toMoneyNumber(revenueAmount),
            expenses: toMoneyNumber(totalExpenses),
            profit: toMoneyNumber(profit),
            profit_margin_pct: toMoneyNumber(profitMarginPct),
          },
        })
      );
    }

    if (revenueAmount > 0 && costRatioPct !== null && costRatioPct > 80) {
      alerts.push(
        buildAlert({
          id: `HIGH_COST_TRIP:${t.id}`,
          type: "HIGH_COST_TRIP",
          severity: "warn",
          area: "finance",
          title: "رحلة بتكلفة مرتفعة",
          message: `الرحلة ${String(t.id).slice(
            0,
            8
          )} تكلفتها تمثل ${costRatioPct.toFixed(2)}% من الإيراد`,
          entity_type: "trip",
          entity_id: t.id,
          href: `/trips/${t.id}`,
          created_at: t.created_at,
          meta: {
            revenue: toMoneyNumber(revenueAmount),
            expenses: toMoneyNumber(totalExpenses),
            cost_ratio_pct: toMoneyNumber(costRatioPct),
          },
        })
      );
    }
  }

  return alerts;
}

async function applyReadState(user, items) {
  const userId = user?.id || user?.sub || user?.userId || null;

  if (!userId || !Array.isArray(items) || !items.length) {
    return items || [];
  }

  const keys = items.map((x) => String(x.alert_key || x.id)).filter(Boolean);
  if (!keys.length) return items;

  const reads = await prisma.alert_reads.findMany({
    where: {
      user_id: userId,
      alert_key: {
        in: keys,
      },
    },
    select: {
      alert_key: true,
      read_at: true,
    },
  });

  const readsMap = new Map((reads || []).map((r) => [String(r.alert_key), r]));

  return items.map((item) => {
    const found = readsMap.get(String(item.alert_key || item.id));

    return {
      ...item,
      is_read: Boolean(found),
      read_at: found?.read_at || null,
    };
  });
}

function applyReadStatusFilter(items, readStatus) {
  const status = String(readStatus || "all").toLowerCase();

  if (status === "read") return items.filter((x) => x.is_read);
  if (status === "unread") return items.filter((x) => !x.is_read);

  return items;
}

async function getBaseAlerts(user, filters = {}) {
  const companyId = normalizeUuidOrNull(filters.companyId);
  const area = filters.area ? String(filters.area).toLowerCase() : null;
  const clientId = normalizeUuidOrNull(filters.clientId);
  const siteId = normalizeUuidOrNull(filters.siteId);

  if (!companyId) return [];

  const areas = area
    ? [area]
    : [
        "operations",
        "finance",
        "maintenance",
        ...(isAdminOrHR(user?.role) ? ["compliance"] : []),
      ];

  const parts = await Promise.all([
    areas.includes("operations")
      ? getOperationsAlerts({
          companyId,
          user,
          clientId,
          siteId,
        })
      : Promise.resolve([]),

    areas.includes("finance")
      ? getFinanceAlerts({
          companyId,
          clientId,
        })
      : Promise.resolve([]),

    areas.includes("maintenance")
      ? getMaintenanceAlerts(companyId)
      : Promise.resolve([]),

    areas.includes("compliance")
      ? getComplianceAlerts(companyId, {
          daysWindow: filters.days || filters.daysWindow || 30,
          limit: filters.limit || 50,
        })
      : Promise.resolve([]),

    areas.includes("operations") || areas.includes("finance")
      ? getTripBusinessAlerts({
          companyId,
          user,
          clientId,
          siteId,
        })
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

  return items;
}

exports.getAlerts = async (user, filters = {}) => {
  const limit = Math.min(500, Math.max(1, Number(filters.limit || 50)));
  const readStatus = String(filters.readStatus || "all").toLowerCase();

  let items = await getBaseAlerts(user, filters);

  items = await applyReadState(user, items);
  items = applyReadStatusFilter(items, readStatus);

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
    limit: 1000,
    readStatus: "all",
  });

  const out = {
    total: Number(data.total || 0),
    unread: 0,
    read: 0,
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
    if (out.by_severity[a.severity] != null) {
      out.by_severity[a.severity] += 1;
    }

    if (out.by_area[a.area] != null) {
      out.by_area[a.area] += 1;
    }

    if (a.is_read) out.read += 1;
    else out.unread += 1;
  }

  return out;
};

exports.markAlertRead = async (user, alertKey) => {
  const userId = user?.id || user?.sub || user?.userId || null;

  if (!userId) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  const key = String(alertKey || "").trim();

  if (!key) {
    const err = new Error("alert_key is required");
    err.status = 400;
    throw err;
  }

  return prisma.alert_reads.upsert({
    where: {
      alert_key_user_id: {
        alert_key: key,
        user_id: userId,
      },
    },
    update: {
      read_at: new Date(),
    },
    create: {
      alert_key: key,
      user_id: userId,
      read_at: new Date(),
    },
  });
};

exports.markAllAlertsRead = async (user, filters = {}) => {
  const userId = user?.id || user?.sub || user?.userId || null;

  if (!userId) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  const data = await exports.getAlerts(user, {
    ...filters,
    limit: 1000,
    readStatus: "unread",
  });

  const unreadItems = Array.isArray(data?.items) ? data.items : [];

  if (!unreadItems.length) {
    return {
      updated: 0,
    };
  }

  const now = new Date();

  const writes = unreadItems.map((item) =>
    prisma.alert_reads.upsert({
      where: {
        alert_key_user_id: {
          alert_key: String(item.alert_key || item.id),
          user_id: userId,
        },
      },
      update: {
        read_at: now,
      },
      create: {
        alert_key: String(item.alert_key || item.id),
        user_id: userId,
        read_at: now,
      },
    })
  );

  await prisma.$transaction(writes);

  return {
    updated: unreadItems.length,
  };
};

exports.getComplianceSnapshot = getComplianceSnapshot;