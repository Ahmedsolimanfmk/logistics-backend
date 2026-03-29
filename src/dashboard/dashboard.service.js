const prisma = require("../prisma");
const { DateTime } = require("luxon");
const {
  getCairoDayRange,
  getCairoMonthRange,
  getCairoRangeDefault14Days,
} = require("./dateRange");

const CAIRO_TZ = "Africa/Cairo";

function bucketToDateTrunc(bucket) {
  return bucket === "hourly" ? "hour" : "day";
}

function normalizeUuidOrNull(v) {
  if (!v || String(v).trim() === "") return null;
  return String(v).trim();
}

function fillMissingBuckets(points, from, to, trunc) {
  const zone = CAIRO_TZ;
  const map = new Map();

  for (const p of points || []) {
    const b = p.bucket instanceof Date ? p.bucket : new Date(p.bucket);
    map.set(b.toISOString(), Number(p.value));
  }

  const result = [];
  let cursor = DateTime.fromJSDate(from, { zone }).startOf(trunc);
  const end = DateTime.fromJSDate(to, { zone });

  while (cursor <= end) {
    const bucketUtcIso = cursor.toUTC().toISO({ suppressMilliseconds: false });

    const label =
      trunc === "hour"
        ? cursor.toFormat("yyyy-LL-dd HH:00")
        : cursor.toFormat("yyyy-LL-dd");

    result.push({
      bucket: bucketUtcIso,
      label,
      value: map.get(bucketUtcIso) ?? 0,
    });

    cursor = cursor.plus(trunc === "hour" ? { hours: 1 } : { days: 1 });
  }

  return result;
}

const _cache = new Map();
const CACHE_TTL_MS = 30_000;

function cacheKey(user, filters) {
  const role = String(user?.role || "");
  const uid = String(user?.id || user?.sub || "");
  const companyId = String(filters?.companyId || "");
  const tab = String(filters?.tab || "operations");
  const from = filters?.from || "";
  const to = filters?.to || "";
  const clientId = filters?.clientId || "";
  const siteId = filters?.siteId || "";
  return `${companyId}:${role}:${uid}:${tab}:${from}:${to}:${clientId}:${siteId}`;
}
function cacheGet(key) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return e.value;
}
function cacheSet(key, value) {
  _cache.set(key, { at: Date.now(), value });
}

function roleUpper(r) {
  return String(r || "").toUpperCase();
}
function isSupervisorRole(role) {
  return roleUpper(role) === "FIELD_SUPERVISOR";
}

function toMoneyNumber(v) {
  return Number(Number(v ?? 0).toFixed(2));
}

function daysBetweenCairo(fromDate, toDate) {
  const from = DateTime.fromJSDate(
    fromDate instanceof Date ? fromDate : new Date(fromDate),
    { zone: CAIRO_TZ }
  ).startOf("day");

  const to = DateTime.fromJSDate(
    toDate instanceof Date ? toDate : new Date(toDate),
    { zone: CAIRO_TZ }
  ).startOf("day");

  return Math.round(to.diff(from, "days").days);
}

async function getArDueAlerts({ companyId, clientId = null, top = 10 } = {}) {
  const todayStartCairo = DateTime.now().setZone(CAIRO_TZ).startOf("day");
  const dueSoonEndExclusiveCairo = todayStartCairo.plus({ days: 8 });

  const todayStartUtc = todayStartCairo.toUTC().toJSDate();

  const rows = await prisma.$queryRaw`
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
  `;

  const overdueInvoices = [];
  const dueSoonInvoices = [];

  for (const r of rows || []) {
    const totalAmount = Number(r.total_amount ?? 0);
    const allocatedAmount = Number(r.allocated_amount ?? 0);
    const outstandingAmount = totalAmount - allocatedAmount;

    if (!(outstandingAmount > 0)) continue;

    const dueDateJs = r.due_date instanceof Date ? r.due_date : new Date(r.due_date);
    const dueDateCairo = DateTime.fromJSDate(dueDateJs, { zone: CAIRO_TZ }).startOf("day");

    const baseRow = {
      id: r.id,
      invoice_no: r.invoice_no,
      client_id: r.client_id,
      client_name: r.client_name || null,
      issue_date: r.issue_date,
      due_date: r.due_date,
      total_amount: toMoneyNumber(totalAmount),
      allocated_amount: toMoneyNumber(allocatedAmount),
      outstanding_amount: toMoneyNumber(outstandingAmount),
      status: r.status,
    };

    if (dueDateCairo < todayStartCairo) {
      overdueInvoices.push({
        ...baseRow,
        days_overdue: daysBetweenCairo(dueDateJs, todayStartUtc),
      });
      continue;
    }

    if (
      dueDateCairo >= todayStartCairo &&
      dueDateCairo < dueSoonEndExclusiveCairo
    ) {
      dueSoonInvoices.push({
        ...baseRow,
        days_to_due: daysBetweenCairo(todayStartUtc, dueDateJs),
      });
    }
  }

  overdueInvoices.sort((a, b) => {
    const aDue = new Date(a.due_date).getTime();
    const bDue = new Date(b.due_date).getTime();
    if (aDue !== bDue) return aDue - bDue;
    return b.outstanding_amount - a.outstanding_amount;
  });

  dueSoonInvoices.sort((a, b) => {
    const aDue = new Date(a.due_date).getTime();
    const bDue = new Date(b.due_date).getTime();
    if (aDue !== bDue) return aDue - bDue;
    return b.outstanding_amount - a.outstanding_amount;
  });

  const ar_overdue_count = overdueInvoices.length;
  const ar_due_soon_count = dueSoonInvoices.length;

  const ar_overdue_total = toMoneyNumber(
    overdueInvoices.reduce((sum, x) => sum + Number(x.outstanding_amount ?? 0), 0)
  );
  const ar_due_soon_total = toMoneyNumber(
    dueSoonInvoices.reduce((sum, x) => sum + Number(x.outstanding_amount ?? 0), 0)
  );

  return {
    ar_due_soon_count,
    ar_overdue_count,
    ar_due_soon_total,
    ar_overdue_total,
    top_ar_overdue_invoices: overdueInvoices.slice(0, top),
    top_ar_due_soon_invoices: dueSoonInvoices.slice(0, top),
  };
}

exports.getSummary = async (user, filters = {}) => {
  const tab = String(filters.tab || "operations").toLowerCase();

  const companyId = normalizeUuidOrNull(filters.companyId);
  const clientId = normalizeUuidOrNull(filters.clientId);
  const siteId = normalizeUuidOrNull(filters.siteId);

  if (!companyId) {
    const err = new Error("Company context is missing");
    err.status = 400;
    throw err;
  }

  const today = getCairoDayRange(filters.from, filters.to);
  const month = getCairoMonthRange();
  const userId = user?.id || user?.sub || null;
  const isSupervisor = isSupervisorRole(user?.role);

  const key = cacheKey(user, { ...filters, tab, companyId });
  const cached = cacheGet(key);
  if (cached) return cached;

  const out = {
    range: {
      today: { from: today.from, to: today.to },
      month: { from: month.from, to: month.to },
    },
    cards: {},
    tables: {},
    alerts: {},
  };

  const tripWhereTodayBase = {
    company_id: companyId,
    created_at: { gte: today.from, lte: today.to },
    ...(clientId ? { client_id: clientId } : {}),
    ...(siteId ? { site_id: siteId } : {}),
  };

  const tripWhereMonthBase = {
    company_id: companyId,
    created_at: { gte: month.from, lte: month.to },
    ...(clientId ? { client_id: clientId } : {}),
    ...(siteId ? { site_id: siteId } : {}),
  };

  const loadOperations = async () => {
    let tripsTodayByStatus = [];
    if (!isSupervisor) {
      tripsTodayByStatus = await prisma.trips.groupBy({
        by: ["status"],
        where: tripWhereTodayBase,
        _count: { status: true },
      });
    } else {
      tripsTodayByStatus = await prisma.$queryRaw`
        SELECT t.status, COUNT(DISTINCT t.id)::int AS count
        FROM trips t
        JOIN trip_assignments ta
          ON ta.trip_id = t.id
         AND ta.company_id = ${companyId}::uuid
        WHERE t.company_id = ${companyId}::uuid
          AND t.created_at >= ${today.from}
          AND t.created_at <= ${today.to}
          AND ta.is_active = true
          AND ta.field_supervisor_id = ${userId}::uuid
          AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
          AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
        GROUP BY t.status
        ORDER BY t.status;
      `;
    }

    const tripsToday = { total: 0 };
    for (const row of tripsTodayByStatus) {
      const status = row.status;
      const c = row._count?.status ?? row.count ?? 0;
      tripsToday[status] = Number(c);
      tripsToday.total += Number(c);
    }

    let tripsMonthCount = 0;
    if (!isSupervisor) {
      tripsMonthCount = await prisma.trips.count({ where: tripWhereMonthBase });
    } else {
      const rows = await prisma.$queryRaw`
        SELECT COUNT(DISTINCT t.id)::int AS count
        FROM trips t
        JOIN trip_assignments ta
          ON ta.trip_id = t.id
         AND ta.company_id = ${companyId}::uuid
        WHERE t.company_id = ${companyId}::uuid
          AND t.created_at >= ${month.from}
          AND t.created_at <= ${month.to}
          AND ta.field_supervisor_id = ${userId}::uuid
          AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
          AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid);
      `;
      tripsMonthCount = Number(rows?.[0]?.count ?? 0);
    }

    const vehiclesAgg = await prisma.vehicles.groupBy({
      by: ["status"],
      where: {
        company_id: companyId,
      },
      _count: { status: true },
    });

    const vehicles = {};
    let vehiclesTotal = 0;
    for (const v of vehiclesAgg) {
      vehicles[v.status] = Number(v._count.status);
      vehiclesTotal += Number(v._count.status);
    }
    vehicles.total = vehiclesTotal;

    const activeTripsNowRows = await prisma.$queryRaw`
      SELECT
        t.id AS trip_id,
        t.status AS trip_status,
        t.created_at AS trip_created_at,
        c.name AS client_name,
        s.name AS site_name,
        v.id AS vehicle_id,
        v.plate_no AS vehicle_plate_number,
        d.id AS driver_id,
        d.full_name AS driver_name
      FROM trips t
      JOIN trip_assignments ta
        ON ta.trip_id = t.id
       AND ta.company_id = ${companyId}::uuid
       AND ta.is_active = true
      LEFT JOIN clients c
        ON c.id = t.client_id
       AND c.company_id = ${companyId}::uuid
      LEFT JOIN sites s
        ON s.id = t.site_id
       AND s.company_id = ${companyId}::uuid
      LEFT JOIN vehicles v
        ON v.id = ta.vehicle_id
       AND v.company_id = ${companyId}::uuid
      LEFT JOIN drivers d
        ON d.id = ta.driver_id
       AND d.company_id = ${companyId}::uuid
      WHERE t.company_id = ${companyId}::uuid
        AND t.status IN ('ASSIGNED', 'IN_PROGRESS')
        AND (${isSupervisor}::boolean = false OR ta.field_supervisor_id = ${userId}::uuid)
        AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
        AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
      ORDER BY t.created_at DESC
      LIMIT 20;
    `;

    const active_trips_now = (activeTripsNowRows || []).map((r) => ({
      trip_id: r.trip_id,
      trip_status: r.trip_status,
      trip_created_at: r.trip_created_at,
      client: r.client_name,
      site: r.site_name,
      vehicle_id: r.vehicle_id,
      vehicle_plate_number: r.vehicle_plate_number,
      driver_id: r.driver_id,
      driver_name: r.driver_name,
    }));

    const needingCloseRows = await prisma.$queryRaw`
      SELECT
        t.id,
        t.status,
        t.created_at,
        t.financial_status,
        t.financial_review_opened_at,
        c.name AS client_name,
        s.name AS site_name
      FROM trips t
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
      ORDER BY t.created_at DESC
      LIMIT 10;
    `;

    out.cards.trips_today = tripsToday;
    out.cards.trips_month_total = tripsMonthCount;
    out.cards.vehicles = vehicles;

    out.tables.active_trips_now = active_trips_now;
    out.tables.trips_needing_finance_close = (needingCloseRows || []).map((t) => ({
      id: t.id,
      status: t.status,
      created_at: t.created_at,
      financial_status: t.financial_status,
      financial_review_opened_at: t.financial_review_opened_at,
      client: t.client_name,
      site: t.site_name,
    }));

    out.alerts.active_trips_now_count = active_trips_now.length;
    out.alerts.trips_completed_not_closed = (needingCloseRows || []).length;
  };

  const loadFinance = async () => {
    const expensesAgg = await prisma.cash_expenses.groupBy({
      by: ["approval_status"],
      where: {
        company_id: companyId,
        created_at: { gte: today.from, lte: today.to },
        ...(isSupervisor ? { created_by: userId } : {}),
      },
      _sum: { amount: true },
    });

    const expensesToday = { APPROVED: 0, PENDING: 0, REJECTED: 0, total: 0 };
    for (const r of expensesAgg) {
      const s = r.approval_status;
      const v = Number(r._sum.amount ?? 0);
      expensesToday[s] = v;
      expensesToday.total += v;
    }

    const topTypes = await prisma.cash_expenses.groupBy({
      by: ["expense_type"],
      where: {
        company_id: companyId,
        created_at: { gte: today.from, lte: today.to },
        approval_status: "APPROVED",
        ...(isSupervisor ? { created_by: userId } : {}),
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 10,
    });

    out.tables.top_expense_types_today = topTypes.map((x) => ({
      expense_type: x.expense_type,
      amount: Number(x._sum.amount ?? 0),
    }));

    const advancesRows = await prisma.$queryRaw`
      SELECT
        a.id,
        a.amount::numeric AS advance_amount,
        a.created_at,
        a.field_supervisor_id,
        COALESCE(
          SUM(
            CASE WHEN e.approval_status = 'APPROVED' THEN e.amount ELSE 0 END
          ),
          0
        )::numeric AS approved_expenses
      FROM cash_advances a
      LEFT JOIN cash_expenses e
        ON e.cash_advance_id = a.id
       AND e.company_id = ${companyId}::uuid
      WHERE a.company_id = ${companyId}::uuid
        AND a.status IN ('OPEN', 'IN_REVIEW')
        AND (${isSupervisor}::boolean = false OR a.field_supervisor_id = ${userId}::uuid)
      GROUP BY a.id, a.amount, a.created_at, a.field_supervisor_id;
    `;

    let advancesOutstandingCount = 0;
    let advancesRemainingTotal = 0;
    for (const r of advancesRows || []) {
      advancesOutstandingCount += 1;
      const adv = Number(r.advance_amount ?? 0);
      const exp = Number(r.approved_expenses ?? 0);
      advancesRemainingTotal += adv - exp;
    }

    const nowCairo = DateTime.now().setZone(CAIRO_TZ);
    const pending48h = nowCairo.minus({ hours: 48 }).toJSDate();
    const advance7d = nowCairo.minus({ days: 7 }).toJSDate();

    const pendingExpensesTooLong = await prisma.cash_expenses.count({
      where: {
        company_id: companyId,
        approval_status: "PENDING",
        created_at: { lt: pending48h },
        ...(isSupervisor ? { created_by: userId } : {}),
      },
    });

    const advancesOpenTooLong = await prisma.cash_advances.count({
      where: {
        company_id: companyId,
        status: { in: ["OPEN", "IN_REVIEW"] },
        created_at: { lt: advance7d },
        ...(isSupervisor ? { field_supervisor_id: userId } : {}),
      },
    });

    const pendingExpenses = await prisma.cash_expenses.findMany({
      where: {
        company_id: companyId,
        approval_status: "PENDING",
        ...(isSupervisor ? { created_by: userId } : {}),
      },
      select: {
        id: true,
        amount: true,
        expense_type: true,
        created_at: true,
        trip_id: true,
        vehicle_id: true,
        cash_advance_id: true,
        trip: {
          select: {
            id: true,
            status: true,
            client: { select: { name: true } },
            site: { select: { name: true } },
          },
        },
      },
      orderBy: { created_at: "asc" },
      take: 10,
    });

    out.tables.pending_expenses_top10 = pendingExpenses.map((e) => ({
      id: e.id,
      amount: Number(e.amount ?? 0),
      expense_type: e.expense_type,
      created_at: e.created_at,
      trip_id: e.trip_id,
      vehicle_id: e.vehicle_id,
      cash_advance_id: e.cash_advance_id,
      trip_status: e.trip?.status,
      client: e.trip?.client?.name,
      site: e.trip?.site?.name,
    }));

    const openAdvancesList = await prisma.$queryRaw`
      SELECT
        a.id,
        a.created_at,
        a.amount::numeric AS advance_amount,
        a.status,
        a.field_supervisor_id,
        COALESCE(
          SUM(
            CASE WHEN e.approval_status = 'APPROVED' THEN e.amount ELSE 0 END
          ),
          0
        )::numeric AS approved_expenses
      FROM cash_advances a
      LEFT JOIN cash_expenses e
        ON e.cash_advance_id = a.id
       AND e.company_id = ${companyId}::uuid
      WHERE a.company_id = ${companyId}::uuid
        AND a.status IN ('OPEN', 'IN_REVIEW')
        AND (${isSupervisor}::boolean = false OR a.field_supervisor_id = ${userId}::uuid)
      GROUP BY a.id, a.created_at, a.amount, a.status, a.field_supervisor_id
      ORDER BY a.created_at ASC
      LIMIT 10;
    `;

    out.tables.advances_open_top10 = (openAdvancesList || []).map((r) => {
      const adv = Number(r.advance_amount ?? 0);
      const exp = Number(r.approved_expenses ?? 0);
      return {
        id: r.id,
        created_at: r.created_at,
        status: r.status,
        advance_amount: adv,
        approved_expenses: exp,
        remaining: adv - exp,
        field_supervisor_id: r.field_supervisor_id,
      };
    });

    const arDue = await getArDueAlerts({
      companyId,
      clientId,
      top: 10,
    });

    out.tables.top_ar_overdue_invoices = arDue.top_ar_overdue_invoices;
    out.tables.top_ar_due_soon_invoices = arDue.top_ar_due_soon_invoices;

    out.cards.ar_due_soon = {
      count: arDue.ar_due_soon_count,
      total: arDue.ar_due_soon_total,
    };

    out.cards.ar_overdue = {
      count: arDue.ar_overdue_count,
      total: arDue.ar_overdue_total,
    };

    out.cards.ap_due_soon = {
      enabled: false,
      count: 0,
      total: 0,
    };

    out.cards.ap_overdue = {
      enabled: false,
      count: 0,
      total: 0,
    };

    out.tables.top_ap_overdue_payables = [];
    out.tables.top_ap_due_soon_payables = [];

    out.cards.expenses_today = expensesToday;
    out.cards.advances_outstanding = {
      count: advancesOutstandingCount,
      remaining_total: advancesRemainingTotal,
    };

    out.alerts.expenses_pending_too_long = pendingExpensesTooLong;
    out.alerts.advances_open = advancesOutstandingCount;
    out.alerts.advances_open_too_long = advancesOpenTooLong;

    out.alerts.ar_due_soon_count = arDue.ar_due_soon_count;
    out.alerts.ar_overdue_count = arDue.ar_overdue_count;
    out.alerts.ar_due_soon_total = arDue.ar_due_soon_total;
    out.alerts.ar_overdue_total = arDue.ar_overdue_total;

    out.alerts.ap_enabled = false;
    out.alerts.ap_due_soon_count = 0;
    out.alerts.ap_overdue_count = 0;
    out.alerts.ap_due_soon_total = 0;
    out.alerts.ap_overdue_total = 0;
  };

  const loadMaintenance = async () => {
    const dayFrom = today.from;
    const dayTo = today.to;

    const open_work_orders = await prisma.maintenance_work_orders.count({
      where: {
        company_id: companyId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    });

    const completedTodayRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM maintenance_work_orders wo
      WHERE wo.company_id = ${companyId}::uuid
        AND wo.status = 'COMPLETED'
        AND COALESCE(wo.completed_at, wo.updated_at) >= ${dayFrom}
        AND COALESCE(wo.completed_at, wo.updated_at) <= ${dayTo};
    `;
    const completed_today = Number(completedTodayRows?.[0]?.count ?? 0);

    const partsCostTodayRows = await prisma.$queryRaw`
      SELECT COALESCE(SUM(l.total_cost), 0)::numeric AS value
      FROM inventory_issue_lines l
      JOIN inventory_issues i ON i.id = l.issue_id
      WHERE i.company_id = ${companyId}::uuid
        AND i.created_at >= ${dayFrom}
        AND i.created_at <= ${dayTo};
    `;
    const maintenance_parts_cost_today = Number(partsCostTodayRows?.[0]?.value ?? 0);

    const cashTodayRows = await prisma.$queryRaw`
      SELECT COALESCE(SUM(e.amount), 0)::numeric AS value
      FROM cash_expenses e
      WHERE e.company_id = ${companyId}::uuid
        AND e.maintenance_work_order_id IS NOT NULL
        AND e.created_at >= ${dayFrom}
        AND e.created_at <= ${dayTo};
    `;
    const maintenance_cash_cost_today = Number(cashTodayRows?.[0]?.value ?? 0);

    const maintenance_cost_today =
      maintenance_parts_cost_today + maintenance_cash_cost_today;

    const qaNeedsRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM maintenance_work_orders wo
      LEFT JOIN post_maintenance_reports pr
        ON pr.work_order_id = wo.id
      WHERE wo.company_id = ${companyId}::uuid
        AND wo.status = 'COMPLETED'
        AND pr.id IS NULL;
    `;
    const qa_needs = Number(qaNeedsRows?.[0]?.count ?? 0);

    const qaFailedRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM post_maintenance_reports pr
      JOIN maintenance_work_orders wo
        ON wo.id = pr.work_order_id
      WHERE wo.company_id = ${companyId}::uuid
        AND pr.road_test_result = 'FAIL';
    `;
    const qa_failed = Number(qaFailedRows?.[0]?.count ?? 0);

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
      SELECT COUNT(DISTINCT d.work_order_id)::int AS count
      FROM diff d
      JOIN maintenance_work_orders wo ON wo.id = d.work_order_id
      WHERE wo.company_id = ${companyId}::uuid
        AND wo.status = 'COMPLETED'
        AND (d.issued_qty <> d.installed_qty);
    `;
    const parts_mismatch = Number(mismatchRows?.[0]?.count ?? 0);

    out.cards.maintenance = {
      open_work_orders,
      completed_today,
      qa_needs,
      qa_failed,
      parts_mismatch,
      maintenance_parts_cost_today,
      maintenance_cash_cost_today,
      maintenance_cost_today,
    };

    out.tables.maintenance_recent_work_orders =
      await prisma.maintenance_work_orders.findMany({
        where: {
          company_id: companyId,
        },
        select: {
          id: true,
          status: true,
          type: true,
          opened_at: true,
          completed_at: true,
          updated_at: true,
          vehicle_id: true,
        },
        orderBy: { updated_at: "desc" },
        take: 10,
      });

    out.alerts.maintenance_open = open_work_orders;
    out.alerts.maintenance_qa_needs = qa_needs;
  };

  if (tab === "finance") await loadFinance();
  else if (tab === "maintenance") await loadMaintenance();
  else await loadOperations();

  cacheSet(key, out);
  return out;
};

exports.getTrends = async (user, params) => {
  const metric = params.metric || "trips_created";
  const bucket = params.bucket || "daily";
  const trunc = bucketToDateTrunc(bucket);

  const companyId = normalizeUuidOrNull(params.companyId);
  const clientId = normalizeUuidOrNull(params.clientId);
  const siteId = normalizeUuidOrNull(params.siteId);
  const vehicleId = normalizeUuidOrNull(params.vehicleId);
  const cashAdvanceId = normalizeUuidOrNull(params.cashAdvanceId);

  if (!companyId) {
    const err = new Error("Company context is missing");
    err.status = 400;
    throw err;
  }

  const { from, to } = getCairoRangeDefault14Days(params.from, params.to);

  if (metric === "trips_created") {
    const createdByFilter = user.role === "FIELD_SUPERVISOR" ? (user.id || user.sub) : null;

    const rows = await prisma.$queryRaw`
      SELECT
        (
          date_trunc(${trunc}, t.created_at AT TIME ZONE ${CAIRO_TZ})
          AT TIME ZONE ${CAIRO_TZ}
        ) AS bucket,
        COUNT(*)::int AS value
      FROM trips t
      WHERE t.company_id = ${companyId}::uuid
        AND t.created_at >= ${from}
        AND t.created_at <= ${to}
        AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
        AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
        AND (${createdByFilter}::uuid IS NULL OR t.created_by = ${createdByFilter}::uuid)
      GROUP BY 1
      ORDER BY 1;
    `;

    return {
      metric,
      bucket: trunc,
      from,
      to,
      points: fillMissingBuckets(rows, from, to, trunc),
    };
  }

  if (metric === "trips_assigned") {
    const supervisorFilter = user.role === "FIELD_SUPERVISOR" ? (user.id || user.sub) : null;

    const rows = await prisma.$queryRaw`
      SELECT
        (
          date_trunc(${trunc}, ta.assigned_at AT TIME ZONE ${CAIRO_TZ})
          AT TIME ZONE ${CAIRO_TZ}
        ) AS bucket,
        COUNT(DISTINCT ta.trip_id)::int AS value
      FROM trip_assignments ta
      JOIN trips t ON t.id = ta.trip_id
      WHERE ta.company_id = ${companyId}::uuid
        AND t.company_id = ${companyId}::uuid
        AND ta.assigned_at >= ${from}
        AND ta.assigned_at <= ${to}
        AND (${supervisorFilter}::uuid IS NULL OR ta.field_supervisor_id = ${supervisorFilter}::uuid)
        AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
        AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
      GROUP BY 1
      ORDER BY 1;
    `;

    return {
      metric,
      bucket: trunc,
      from,
      to,
      points: fillMissingBuckets(rows, from, to, trunc),
    };
  }

  if (metric === "expenses_approved" || metric === "expenses_pending") {
    const approvalStatus =
      metric === "expenses_approved" ? "APPROVED" : "PENDING";
    const createdByFilter = user.role === "FIELD_SUPERVISOR" ? (user.id || user.sub) : null;

    const rows = await prisma.$queryRaw`
      SELECT
        (
          date_trunc(${trunc}, e.created_at AT TIME ZONE ${CAIRO_TZ})
          AT TIME ZONE ${CAIRO_TZ}
        ) AS bucket,
        COALESCE(SUM(e.amount), 0)::numeric AS value
      FROM cash_expenses e
      LEFT JOIN trips t
        ON t.id = e.trip_id
       AND t.company_id = ${companyId}::uuid
      WHERE e.company_id = ${companyId}::uuid
        AND e.created_at >= ${from}
        AND e.created_at <= ${to}
        AND e.approval_status = ${approvalStatus}
        AND (${vehicleId}::uuid IS NULL OR e.vehicle_id = ${vehicleId}::uuid)
        AND (${cashAdvanceId}::uuid IS NULL OR e.cash_advance_id = ${cashAdvanceId}::uuid)
        AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
        AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
        AND (${createdByFilter}::uuid IS NULL OR e.created_by = ${createdByFilter}::uuid)
      GROUP BY 1
      ORDER BY 1;
    `;

    return {
      metric,
      bucket: trunc,
      from,
      to,
      points: fillMissingBuckets(rows, from, to, trunc),
    };
  }

  return {
    metric,
    bucket: trunc,
    from,
    to,
    points: fillMissingBuckets([], from, to, trunc),
  };
};

exports.getTrendsBundle = async (user, params) => {
  const bucket = params.bucket || "daily";
  const trunc = bucketToDateTrunc(bucket);

  const companyId = normalizeUuidOrNull(params.companyId);
  const clientId = normalizeUuidOrNull(params.clientId);
  const siteId = normalizeUuidOrNull(params.siteId);
  const vehicleId = normalizeUuidOrNull(params.vehicleId);
  const cashAdvanceId = normalizeUuidOrNull(params.cashAdvanceId);

  if (!companyId) {
    const err = new Error("Company context is missing");
    err.status = 400;
    throw err;
  }

  const { from, to } = getCairoRangeDefault14Days(params.from, params.to);

  const createdByFilter = user.role === "FIELD_SUPERVISOR" ? (user.id || user.sub) : null;
  const supervisorFilter = user.role === "FIELD_SUPERVISOR" ? (user.id || user.sub) : null;

  const [tripsCreated, tripsAssigned, expensesApproved, expensesPending] =
    await Promise.all([
      prisma.$queryRaw`
        SELECT
          (
            date_trunc(${trunc}, t.created_at AT TIME ZONE ${CAIRO_TZ})
            AT TIME ZONE ${CAIRO_TZ}
          ) AS bucket,
          COUNT(*)::int AS value
        FROM trips t
        WHERE t.company_id = ${companyId}::uuid
          AND t.created_at >= ${from}
          AND t.created_at <= ${to}
          AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
          AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
          AND (${createdByFilter}::uuid IS NULL OR t.created_by = ${createdByFilter}::uuid)
        GROUP BY 1
        ORDER BY 1;
      `,
      prisma.$queryRaw`
        SELECT
          (
            date_trunc(${trunc}, ta.assigned_at AT TIME ZONE ${CAIRO_TZ})
            AT TIME ZONE ${CAIRO_TZ}
          ) AS bucket,
          COUNT(DISTINCT ta.trip_id)::int AS value
        FROM trip_assignments ta
        JOIN trips t ON t.id = ta.trip_id
        WHERE ta.company_id = ${companyId}::uuid
          AND t.company_id = ${companyId}::uuid
          AND ta.assigned_at >= ${from}
          AND ta.assigned_at <= ${to}
          AND (${supervisorFilter}::uuid IS NULL OR ta.field_supervisor_id = ${supervisorFilter}::uuid)
          AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
          AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
        GROUP BY 1
        ORDER BY 1;
      `,
      prisma.$queryRaw`
        SELECT
          (
            date_trunc(${trunc}, e.created_at AT TIME ZONE ${CAIRO_TZ})
            AT TIME ZONE ${CAIRO_TZ}
          ) AS bucket,
          COALESCE(SUM(e.amount), 0)::numeric AS value
        FROM cash_expenses e
        LEFT JOIN trips t
          ON t.id = e.trip_id
         AND t.company_id = ${companyId}::uuid
        WHERE e.company_id = ${companyId}::uuid
          AND e.created_at >= ${from}
          AND e.created_at <= ${to}
          AND e.approval_status = 'APPROVED'
          AND (${vehicleId}::uuid IS NULL OR e.vehicle_id = ${vehicleId}::uuid)
          AND (${cashAdvanceId}::uuid IS NULL OR e.cash_advance_id = ${cashAdvanceId}::uuid)
          AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
          AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
          AND (${createdByFilter}::uuid IS NULL OR e.created_by = ${createdByFilter}::uuid)
        GROUP BY 1
        ORDER BY 1;
      `,
      prisma.$queryRaw`
        SELECT
          (
            date_trunc(${trunc}, e.created_at AT TIME ZONE ${CAIRO_TZ})
            AT TIME ZONE ${CAIRO_TZ}
          ) AS bucket,
          COALESCE(SUM(e.amount), 0)::numeric AS value
        FROM cash_expenses e
        LEFT JOIN trips t
          ON t.id = e.trip_id
         AND t.company_id = ${companyId}::uuid
        WHERE e.company_id = ${companyId}::uuid
          AND e.created_at >= ${from}
          AND e.created_at <= ${to}
          AND e.approval_status = 'PENDING'
          AND (${vehicleId}::uuid IS NULL OR e.vehicle_id = ${vehicleId}::uuid)
          AND (${cashAdvanceId}::uuid IS NULL OR e.cash_advance_id = ${cashAdvanceId}::uuid)
          AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
          AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid)
          AND (${createdByFilter}::uuid IS NULL OR e.created_by = ${createdByFilter}::uuid)
        GROUP BY 1
        ORDER BY 1;
      `,
    ]);

  return {
    bucket: trunc,
    from,
    to,
    trips_created: fillMissingBuckets(tripsCreated, from, to, trunc),
    trips_assigned: fillMissingBuckets(tripsAssigned, from, to, trunc),
    expenses_approved: fillMissingBuckets(expensesApproved, from, to, trunc),
    expenses_pending: fillMissingBuckets(expensesPending, from, to, trunc),
  };
};