// src/dashboard/dashboard.service.js
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

// ===== Zero-fill + Cairo label =====
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

/**
 * ===============================
 * ✅ SIMPLE IN-MEMORY CACHE (30s)
 * ===============================
 */
const _cache = new Map();
const CACHE_TTL_MS = 30_000;

function cacheKey(user, filters) {
  const role = String(user?.role || "");
  const uid = String(user?.id || "");
  const tab = String(filters?.tab || "operations");
  const from = filters?.from || "";
  const to = filters?.to || "";
  const clientId = filters?.clientId || "";
  const siteId = filters?.siteId || "";
  return `${role}:${uid}:${tab}:${from}:${to}:${clientId}:${siteId}`;
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

/**
 * ===============================
 * ✅ Dashboard Summary (TAB-BASED)
 * ===============================
 * tabs: operations | finance | maintenance
 */
exports.getSummary = async (user, filters = {}) => {
  const tab = String(filters.tab || "operations").toLowerCase();

  const clientId = normalizeUuidOrNull(filters.clientId);
  const siteId = normalizeUuidOrNull(filters.siteId);

  const today = getCairoDayRange(filters.from, filters.to);
  const month = getCairoMonthRange();
  const isSupervisor = isSupervisorRole(user?.role);

  // ✅ cache for summary
  const key = cacheKey(user, { ...filters, tab });
  const cached = cacheGet(key);
  if (cached) return cached;

  // response shell
  const out = {
    range: {
      today: { from: today.from, to: today.to },
      month: { from: month.from, to: month.to },
    },
    cards: {},
    tables: {},
    alerts: {},
  };

  // =========================
  // Helpers for conditions
  // =========================
  const tripWhereTodayBase = {
    created_at: { gte: today.from, lte: today.to },
    ...(clientId ? { client_id: clientId } : {}),
    ...(siteId ? { site_id: siteId } : {}),
  };

  const tripWhereMonthBase = {
    created_at: { gte: month.from, lte: month.to },
    ...(clientId ? { client_id: clientId } : {}),
    ...(siteId ? { site_id: siteId } : {}),
  };

  // =========================
  // OPERATIONS TAB
  // =========================
  const loadOperations = async () => {
    // Trips today by status
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
        JOIN trip_assignments ta ON ta.trip_id = t.id
        WHERE t.created_at >= ${today.from}
          AND t.created_at <= ${today.to}
          AND ta.is_active = true
          AND ta.field_supervisor_id = ${user.id}::uuid
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

    // Trips month count
    let tripsMonthCount = 0;
    if (!isSupervisor) {
      tripsMonthCount = await prisma.trips.count({ where: tripWhereMonthBase });
    } else {
      const rows = await prisma.$queryRaw`
        SELECT COUNT(DISTINCT t.id)::int AS count
        FROM trips t
        JOIN trip_assignments ta ON ta.trip_id = t.id
        WHERE t.created_at >= ${month.from}
          AND t.created_at <= ${month.to}
          AND ta.field_supervisor_id = ${user.id}::uuid
          AND (${clientId}::uuid IS NULL OR t.client_id = ${clientId}::uuid)
          AND (${siteId}::uuid IS NULL OR t.site_id = ${siteId}::uuid);
      `;
      tripsMonthCount = Number(rows?.[0]?.count ?? 0);
    }

    // Vehicles snapshot
    const vehiclesAgg = await prisma.vehicles.groupBy({
      by: ["status"],
      _count: { status: true },
    });

    const vehicles = {};
    let vehiclesTotal = 0;
    for (const v of vehiclesAgg) {
      vehicles[v.status] = Number(v._count.status);
      vehiclesTotal += Number(v._count.status);
    }
    vehicles.total = vehiclesTotal;

    // Active trips now
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
      JOIN trip_assignments ta ON ta.trip_id = t.id AND ta.is_active = true
      LEFT JOIN clients c ON c.id = t.client_id
      LEFT JOIN sites s ON s.id = t.site_id
      LEFT JOIN vehicles v ON v.id = ta.vehicle_id
      LEFT JOIN drivers d ON d.id = ta.driver_id
      WHERE t.status IN ('ASSIGNED', 'IN_PROGRESS')
        AND (${isSupervisor}::boolean = false OR ta.field_supervisor_id = ${user.id}::uuid)
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

    // Trips needing finance close
    const needingClose = await prisma.trips.findMany({
      where: {
        status: "COMPLETED",
        financial_closed_at: null,
        ...(clientId ? { client_id: clientId } : {}),
        ...(siteId ? { site_id: siteId } : {}),
      },
      select: {
        id: true,
        status: true,
        created_at: true,
        financial_status: true,
        financial_review_opened_at: true,
        clients: { select: { name: true } },
        sites: { select: { name: true } },
      },
      orderBy: { created_at: "desc" },
      take: 10,
    });

    out.cards.trips_today = tripsToday;
    out.cards.trips_month_total = tripsMonthCount;
    out.cards.vehicles = vehicles;

    out.tables.active_trips_now = active_trips_now;
    out.tables.trips_needing_finance_close = needingClose.map((t) => ({
      id: t.id,
      status: t.status,
      created_at: t.created_at,
      financial_status: t.financial_status,
      financial_review_opened_at: t.financial_review_opened_at,
      client: t.clients?.name,
      site: t.sites?.name,
    }));

    out.alerts.active_trips_now_count = active_trips_now.length;
    out.alerts.trips_completed_not_closed = needingClose.length;
  };

  // =========================
  // FINANCE TAB
  // =========================
  const loadFinance = async () => {
    // Expenses today (sum by status)
    const expensesAgg = await prisma.cash_expenses.groupBy({
      by: ["approval_status"],
      where: {
        created_at: { gte: today.from, lte: today.to },
        ...(isSupervisor ? { created_by: user.id } : {}),
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

    // ✅ Top expense types today (APPROVED only)
    const topTypes = await prisma.cash_expenses.groupBy({
      by: ["expense_type"],
      where: {
        created_at: { gte: today.from, lte: today.to },
        approval_status: "APPROVED",
        ...(isSupervisor ? { created_by: user.id } : {}),
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 10,
    });

    out.tables.top_expense_types_today = topTypes.map((x) => ({
      expense_type: x.expense_type,
      amount: Number(x._sum.amount ?? 0),
    }));

    // Outstanding advances
    const advancesRows = await prisma.$queryRaw`
      SELECT
        a.id,
        a.amount::numeric AS advance_amount,
        a.created_at,
        a.field_supervisor_id,
        COALESCE(SUM(CASE WHEN e.approval_status = 'APPROVED' THEN e.amount ELSE 0 END), 0)::numeric AS approved_expenses
      FROM cash_advances a
      LEFT JOIN cash_expenses e ON e.cash_advance_id = a.id
      WHERE a.status IN ('OPEN', 'IN_REVIEW')
        AND (${isSupervisor}::boolean = false OR a.field_supervisor_id = ${user.id}::uuid)
      GROUP BY a.id, a.amount, a.created_at, a.field_supervisor_id;
    `;

    let advancesOutstandingCount = 0;
    let advancesRemainingTotal = 0;
    for (const r of advancesRows) {
      advancesOutstandingCount += 1;
      const adv = Number(r.advance_amount ?? 0);
      const exp = Number(r.approved_expenses ?? 0);
      advancesRemainingTotal += adv - exp;
    }

    // alerts engine
    const nowCairo = DateTime.now().setZone(CAIRO_TZ);
    const pending48h = nowCairo.minus({ hours: 48 }).toJSDate();
    const advance7d = nowCairo.minus({ days: 7 }).toJSDate();

    const pendingExpensesTooLong = await prisma.cash_expenses.count({
      where: {
        approval_status: "PENDING",
        created_at: { lt: pending48h },
        ...(isSupervisor ? { created_by: user.id } : {}),
      },
    });

    const advancesOpenTooLong = await prisma.cash_advances.count({
      where: {
        status: { in: ["OPEN", "IN_REVIEW"] },
        created_at: { lt: advance7d },
        ...(isSupervisor ? { field_supervisor_id: user.id } : {}),
      },
    });

    // pending expenses top10
    const pendingExpenses = await prisma.cash_expenses.findMany({
      where: {
        approval_status: "PENDING",
        ...(isSupervisor ? { created_by: user.id } : {}),
      },
      select: {
        id: true,
        amount: true,
        expense_type: true,
        created_at: true,
        trip_id: true,
        vehicle_id: true,
        cash_advance_id: true,
        trips: {
          select: {
            id: true,
            clients: { select: { name: true } },
            sites: { select: { name: true } },
            status: true,
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
      trip_status: e.trips?.status,
      client: e.trips?.clients?.name,
      site: e.trips?.sites?.name,
    }));

    // open advances top10
    const openAdvancesList = await prisma.$queryRaw`
      SELECT
        a.id,
        a.created_at,
        a.amount::numeric AS advance_amount,
        a.status,
        a.field_supervisor_id,
        COALESCE(SUM(CASE WHEN e.approval_status = 'APPROVED' THEN e.amount ELSE 0 END), 0)::numeric AS approved_expenses
      FROM cash_advances a
      LEFT JOIN cash_expenses e ON e.cash_advance_id = a.id
      WHERE a.status IN ('OPEN', 'IN_REVIEW')
        AND (${isSupervisor}::boolean = false OR a.field_supervisor_id = ${user.id}::uuid)
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

    out.cards.expenses_today = expensesToday;
    out.cards.advances_outstanding = {
      count: advancesOutstandingCount,
      remaining_total: advancesRemainingTotal,
    };

    out.alerts.expenses_pending_too_long = pendingExpensesTooLong;
    out.alerts.advances_open = advancesOutstandingCount;
    out.alerts.advances_open_too_long = advancesOpenTooLong;
  };

  // =========================
  // MAINTENANCE TAB
  // =========================
  const loadMaintenance = async () => {
    const dayFrom = today.from;
    const dayTo = today.to;

    // ✅ Open WOs
    const open_work_orders = await prisma.maintenance_work_orders.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
    });

    // ✅ Completed today
    const completedTodayRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM maintenance_work_orders wo
      WHERE wo.status = 'COMPLETED'
        AND COALESCE(wo.completed_at, wo.updated_at) >= ${dayFrom}
        AND COALESCE(wo.completed_at, wo.updated_at) <= ${dayTo};
    `;
    const completed_today = Number(completedTodayRows?.[0]?.count ?? 0);

    // ✅ Parts cost today
    const partsCostTodayRows = await prisma.$queryRaw`
      SELECT COALESCE(SUM(l.total_cost), 0)::numeric AS value
      FROM inventory_issue_lines l
      JOIN inventory_issues i ON i.id = l.issue_id
      WHERE i.created_at >= ${dayFrom}
        AND i.created_at <= ${dayTo};
    `;
    const maintenance_parts_cost_today = Number(partsCostTodayRows?.[0]?.value ?? 0);

    // ✅ Cash cost today (WO-linked)
    const cashTodayRows = await prisma.$queryRaw`
      SELECT COALESCE(SUM(e.amount), 0)::numeric AS value
      FROM cash_expenses e
      WHERE e.maintenance_work_order_id IS NOT NULL
        AND e.created_at >= ${dayFrom}
        AND e.created_at <= ${dayTo};
    `;
    const maintenance_cash_cost_today = Number(cashTodayRows?.[0]?.value ?? 0);

    const maintenance_cost_today = maintenance_parts_cost_today + maintenance_cash_cost_today;

    // ✅ QA needs (completed without post report)
    const qaNeedsRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM maintenance_work_orders wo
      LEFT JOIN post_maintenance_reports pr
        ON pr.work_order_id = wo.id
      WHERE wo.status = 'COMPLETED'
        AND pr.id IS NULL;
    `;
    const qa_needs = Number(qaNeedsRows?.[0]?.count ?? 0);

    // ✅ QA failed
    const qaFailedRows = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM post_maintenance_reports pr
      WHERE pr.road_test_result = 'FAIL';
    `;
    const qa_failed = Number(qaFailedRows?.[0]?.count ?? 0);

    // ✅ Parts mismatch (issued != installed)
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
      SELECT COUNT(DISTINCT d.work_order_id)::int AS count
      FROM diff d
      JOIN maintenance_work_orders wo ON wo.id = d.work_order_id
      WHERE wo.status = 'COMPLETED'
        AND (d.issued_qty <> d.installed_qty);
    `;
    const parts_mismatch = Number(mismatchRows?.[0]?.count ?? 0);

    // ✅ IMPORTANT: keys match frontend (cards.maintenance.*)
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

  // =========================
  // ✅ Execute per tab
  // =========================
  if (tab === "finance") await loadFinance();
  else if (tab === "maintenance") await loadMaintenance();
  else await loadOperations();

  cacheSet(key, out);
  return out;
};

// ===============================
// Trends (Single Metric)
// ===============================
exports.getTrends = async (user, params) => {
  const metric = params.metric || "trips_created";
  const bucket = params.bucket || "daily";
  const trunc = bucketToDateTrunc(bucket);

  const clientId = normalizeUuidOrNull(params.clientId);
  const siteId = normalizeUuidOrNull(params.siteId);
  const vehicleId = normalizeUuidOrNull(params.vehicleId);
  const cashAdvanceId = normalizeUuidOrNull(params.cashAdvanceId);

  const { from, to } = getCairoRangeDefault14Days(params.from, params.to);

  if (metric === "trips_created") {
    const createdByFilter = user.role === "FIELD_SUPERVISOR" ? user.id : null;

    const rows = await prisma.$queryRaw`
      SELECT
        (
          date_trunc(${trunc}, t.created_at AT TIME ZONE ${CAIRO_TZ})
          AT TIME ZONE ${CAIRO_TZ}
        ) AS bucket,
        COUNT(*)::int AS value
      FROM trips t
      WHERE t.created_at >= ${from}
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
    const supervisorFilter = user.role === "FIELD_SUPERVISOR" ? user.id : null;

    const rows = await prisma.$queryRaw`
      SELECT
        (
          date_trunc(${trunc}, ta.assigned_at AT TIME ZONE ${CAIRO_TZ})
          AT TIME ZONE ${CAIRO_TZ}
        ) AS bucket,
        COUNT(DISTINCT ta.trip_id)::int AS value
      FROM trip_assignments ta
      JOIN trips t ON t.id = ta.trip_id
      WHERE ta.assigned_at >= ${from}
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
    const createdByFilter = user.role === "FIELD_SUPERVISOR" ? user.id : null;

    const rows = await prisma.$queryRaw`
      SELECT
        (
          date_trunc(${trunc}, e.created_at AT TIME ZONE ${CAIRO_TZ})
          AT TIME ZONE ${CAIRO_TZ}
        ) AS bucket,
        COALESCE(SUM(e.amount), 0)::numeric AS value
      FROM cash_expenses e
      LEFT JOIN trips t ON t.id = e.trip_id
      WHERE e.created_at >= ${from}
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

// ===============================
// Trends Bundle
// ===============================
exports.getTrendsBundle = async (user, params) => {
  const bucket = params.bucket || "daily";
  const trunc = bucketToDateTrunc(bucket);

  const clientId = normalizeUuidOrNull(params.clientId);
  const siteId = normalizeUuidOrNull(params.siteId);
  const vehicleId = normalizeUuidOrNull(params.vehicleId);
  const cashAdvanceId = normalizeUuidOrNull(params.cashAdvanceId);

  const { from, to } = getCairoRangeDefault14Days(params.from, params.to);

  const createdByFilter = user.role === "FIELD_SUPERVISOR" ? user.id : null;
  const supervisorFilter = user.role === "FIELD_SUPERVISOR" ? user.id : null;

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
        WHERE t.created_at >= ${from}
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
        WHERE ta.assigned_at >= ${from}
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
        LEFT JOIN trips t ON t.id = e.trip_id
        WHERE e.created_at >= ${from}
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
        LEFT JOIN trips t ON t.id = e.trip_id
        WHERE e.created_at >= ${from}
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
