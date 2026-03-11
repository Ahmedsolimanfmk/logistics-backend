const prisma = require("../prisma");

// =======================
// Helpers
// =======================
function roleUpper(role) {
  return String(role || "").toUpperCase();
}

function isAdminOrAccountant(role) {
  return ["ADMIN", "ACCOUNTANT"].includes(roleUpper(role));
}

function cleanText(v) {
  return String(v || "").trim();
}

function normalizeText(v) {
  return cleanText(v)
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ");
}

function getUserId(user) {
  return user?.sub || user?.id || user?.userId || null;
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function normalizePaymentSource(v) {
  const s = String(v || "ADVANCE").toUpperCase();
  if (["COMPANY", "CO", "DIRECT"].includes(s)) return "COMPANY";
  if (["CASH", "ADVANCE", "ADV"].includes(s)) return "ADVANCE";
  return "ADVANCE";
}

async function assertVehicleInSupervisorPortfolio({ vehicle_id, userId }) {
  const row = await prisma.vehicle_portfolio.findFirst({
    where: {
      vehicle_id,
      field_supervisor_id: userId,
      is_active: true,
    },
    select: { id: true },
  });

  return !!row;
}

async function assertTripBelongsToSupervisor({ trip_id, userId, vehicle_id }) {
  const where = { trip_id, field_supervisor_id: userId };
  if (vehicle_id) where.vehicle_id = vehicle_id;

  const row = await prisma.trip_assignments.findFirst({
    where,
    orderBy: { assigned_at: "desc" },
    select: { id: true },
  });

  return !!row;
}

function isTripFinancialLocked(financial_status) {
  const s = String(financial_status || "OPEN").toUpperCase();
  return ["IN_REVIEW", "CLOSED"].includes(s);
}

async function resolveVehicleByHint(vehicleHint) {
  const hint = cleanText(vehicleHint);
  if (!hint) return null;

  if (isUuid(hint)) {
    const byId = await prisma.vehicles.findUnique({
      where: { id: hint },
      select: {
        id: true,
        fleet_no: true,
        plate_no: true,
        display_name: true,
        status: true,
      },
    });

    if (byId) return byId;
  }

  const normalizedHint = normalizeText(hint);

  const candidates = await prisma.vehicles.findMany({
    take: 50,
    select: {
      id: true,
      fleet_no: true,
      plate_no: true,
      display_name: true,
      status: true,
    },
  });

  const scored = candidates
    .map((v) => {
      const fleet = normalizeText(v.fleet_no || "");
      const plate = normalizeText(v.plate_no || "");
      const display = normalizeText(v.display_name || "");

      let score = 0;

      if (fleet && fleet === normalizedHint) score = Math.max(score, 100);
      if (plate && plate === normalizedHint) score = Math.max(score, 100);
      if (display && display === normalizedHint) score = Math.max(score, 100);

      if (fleet && fleet.includes(normalizedHint)) score = Math.max(score, 80);
      if (plate && plate.includes(normalizedHint)) score = Math.max(score, 80);
      if (display && display.includes(normalizedHint)) score = Math.max(score, 80);

      if (normalizedHint.includes(fleet) && fleet) score = Math.max(score, 70);
      if (normalizedHint.includes(plate) && plate) score = Math.max(score, 70);
      if (normalizedHint.includes(display) && display) score = Math.max(score, 70);

      return { vehicle: v, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.vehicle || null;
}

async function resolveTripByHint(tripHint) {
  const hint = cleanText(tripHint);
  if (!hint) return null;

  if (isUuid(hint)) {
    const byId = await prisma.trips.findUnique({
      where: { id: hint },
      select: {
        id: true,
        financial_status: true,
      },
    });
    if (byId) return byId;
  }

  const numericId = Number(hint);
  if (Number.isFinite(numericId)) {
    const candidates = await prisma.trips.findMany({
      take: 20,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        financial_status: true,
      },
    });

    const found = candidates.find((x) => String(x.id).includes(String(hint)));
    if (found) return found;
  }

  return null;
}

async function resolveWorkOrderByHint(workOrderHint) {
  const hint = cleanText(workOrderHint);
  if (!hint) return null;

  if (isUuid(hint)) {
    const byId = await prisma.maintenance_work_orders.findUnique({
      where: { id: hint },
      select: {
        id: true,
        vehicle_id: true,
        status: true,
      },
    });
    if (byId) return byId;
  }

  return null;
}

async function resolveOpenAdvanceForSupervisor(userId) {
  return prisma.cash_advances.findFirst({
    where: {
      field_supervisor_id: userId,
      status: "OPEN",
    },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      amount: true,
      status: true,
      field_supervisor_id: true,
    },
  });
}

// =======================
// REAL Executor: Create Maintenance Request
// =======================
async function createMaintenanceRequestExecutor({ user, payload }) {
  const userId = getUserId(user);
  if (!userId) {
    return {
      ok: false,
      executed: false,
      message: "Unauthorized",
      payload,
    };
  }

  const vehicleHint = cleanText(payload?.vehicle_hint);
  const description = cleanText(payload?.description);
  const problemTitle = cleanText(
    payload?.title || payload?.problem_title || payload?.description
  );

  const vehicle = await resolveVehicleByHint(vehicleHint);

  if (!vehicle) {
    return {
      ok: false,
      executed: false,
      message: "Vehicle not found from provided hint",
      payload,
    };
  }

  const role = user?.role || null;
  if (!isAdminOrAccountant(role)) {
    const ok = await assertVehicleInSupervisorPortfolio({
      vehicle_id: vehicle.id,
      userId,
    });

    if (!ok) {
      return {
        ok: false,
        executed: false,
        message: "Forbidden: vehicle not in your portfolio",
        payload,
      };
    }
  }

  const now = new Date();

  const row = await prisma.maintenance_requests.create({
    data: {
      vehicle_id: vehicle.id,
      problem_title: problemTitle || "طلب صيانة",
      problem_description: description || null,
      status: "SUBMITTED",
      requested_by: userId,
      requested_at: now,
      created_at: now,
      updated_at: now,
    },
    select: {
      id: true,
      vehicle_id: true,
      problem_title: true,
      problem_description: true,
      status: true,
      requested_at: true,
      created_at: true,
      updated_at: true,
    },
  });

  return {
    ok: true,
    executed: true,
    executor: "createMaintenanceRequestExecutor",
    data: {
      request: row,
      vehicle: {
        id: vehicle.id,
        fleet_no: vehicle.fleet_no || null,
        plate_no: vehicle.plate_no || null,
        display_name: vehicle.display_name || null,
      },
    },
  };
}

// =======================
// REAL Executor: Create Work Order
// =======================
async function createWorkOrderExecutor({ user, payload }) {
  const userId = getUserId(user);
  if (!userId) {
    return {
      ok: false,
      executed: false,
      message: "Unauthorized",
      payload,
    };
  }

  const vehicleHint = cleanText(payload?.vehicle_hint);
  const title = cleanText(payload?.title || "أعمال صيانة");
  const notes = cleanText(payload?.notes || title);

  const vehicle = await resolveVehicleByHint(vehicleHint);

  if (!vehicle) {
    return {
      ok: false,
      executed: false,
      message: "Vehicle not found from provided hint",
      payload,
    };
  }

  const role = user?.role || null;
  if (!isAdminOrAccountant(role)) {
    const ok = await assertVehicleInSupervisorPortfolio({
      vehicle_id: vehicle.id,
      userId,
    });

    if (!ok) {
      return {
        ok: false,
        executed: false,
        message: "Forbidden: vehicle not in your portfolio",
        payload,
      };
    }
  }

  const now = new Date();

  const workOrder = await prisma.$transaction(async (tx) => {
    const wo = await tx.maintenance_work_orders.create({
      data: {
        vehicle_id: vehicle.id,
        status: "OPEN",
        type: "CORRECTIVE",
        opened_at: now,
        created_by: userId,
        created_at: now,
        updated_at: now,
        notes,
      },
      select: {
        id: true,
        vehicle_id: true,
        request_id: true,
        status: true,
        type: true,
        opened_at: true,
        created_at: true,
        updated_at: true,
        notes: true,
      },
    });

    await tx.vehicles.update({
      where: { id: vehicle.id },
      data: {
        status: "MAINTENANCE",
        updated_at: now,
      },
    });

    if (tx.maintenance_work_order_events?.create) {
      await tx.maintenance_work_order_events.create({
        data: {
          work_order_id: wo.id,
          event_type: "CREATE",
          actor_id: userId,
          notes,
          payload: null,
          created_at: now,
        },
      });
    }

    return wo;
  });

  return {
    ok: true,
    executed: true,
    executor: "createWorkOrderExecutor",
    data: {
      work_order: workOrder,
      vehicle: {
        id: vehicle.id,
        fleet_no: vehicle.fleet_no || null,
        plate_no: vehicle.plate_no || null,
        display_name: vehicle.display_name || null,
      },
    },
  };
}

// =======================
// REAL Executor: Create Expense
// =======================
async function createExpenseExecutor({ user, payload }) {
  const userId = getUserId(user);
  if (!userId) {
    return {
      ok: false,
      executed: false,
      message: "Unauthorized",
      payload,
    };
  }

  const role = user?.role || null;
  const isPrivileged = isAdminOrAccountant(role);

  const amount = Number(payload?.amount || 0);
  const expenseType = cleanText(payload?.expense_type);
  const notes = cleanText(payload?.notes || "");
  const vehicleHint = cleanText(payload?.vehicle_hint || "");
  const tripHint = cleanText(payload?.trip_hint || "");
  const workOrderHint = cleanText(payload?.work_order_hint || "");
  const paymentSource = normalizePaymentSource(
    payload?.payment_source || (isPrivileged ? "COMPANY" : "ADVANCE")
  );

  if (!expenseType) {
    return {
      ok: false,
      executed: false,
      message: "expense_type is required",
      payload,
    };
  }

  if (!amount || amount <= 0) {
    return {
      ok: false,
      executed: false,
      message: "amount must be > 0",
      payload,
    };
  }

  const vehicle = vehicleHint ? await resolveVehicleByHint(vehicleHint) : null;
  const trip = tripHint ? await resolveTripByHint(tripHint) : null;
  const workOrder = workOrderHint
    ? await resolveWorkOrderByHint(workOrderHint)
    : payload?.maintenance_work_order_id
    ? await resolveWorkOrderByHint(payload.maintenance_work_order_id)
    : null;

  const finalTripId =
    payload?.trip_id && isUuid(payload.trip_id) ? payload.trip_id : trip?.id || null;

  const finalWorkOrderId =
    payload?.maintenance_work_order_id && isUuid(payload.maintenance_work_order_id)
      ? payload.maintenance_work_order_id
      : workOrder?.id || null;

  const finalVehicleId =
    vehicle?.id ||
    workOrder?.vehicle_id ||
    payload?.vehicle_id ||
    null;

  if (finalTripId) {
    const tripRow =
      trip ||
      (await prisma.trips.findUnique({
        where: { id: finalTripId },
        select: { id: true, financial_status: true },
      }));

    if (!tripRow) {
      return {
        ok: false,
        executed: false,
        message: "Invalid trip reference",
        payload,
      };
    }

    if (isTripFinancialLocked(tripRow.financial_status)) {
      return {
        ok: false,
        executed: false,
        message: `Trip is financially locked (${tripRow.financial_status})`,
        payload,
      };
    }
  }

  // =======================
  // COMPANY expense
  // =======================
  if (paymentSource === "COMPANY") {
    if (!isPrivileged) {
      return {
        ok: false,
        executed: false,
        message: "Only ADMIN or ACCOUNTANT can create COMPANY expenses",
        payload,
      };
    }

    const vendorName = cleanText(payload?.vendor_name || "AI Created Expense");

    const created = await prisma.cash_expenses.create({
      data: {
        payment_source: "COMPANY",

        trips: finalTripId ? { connect: { id: finalTripId } } : undefined,

        vehicles: finalVehicleId
          ? { connect: { id: finalVehicleId } }
          : undefined,

        maintenance_work_orders: finalWorkOrderId
          ? { connect: { id: finalWorkOrderId } }
          : undefined,

        expense_type: expenseType,
        amount,
        notes: notes || null,
        receipt_url: payload?.receipt_url ? String(payload.receipt_url) : null,

        vendor_name: vendorName,
        invoice_no: payload?.invoice_no ? String(payload.invoice_no) : null,
        invoice_date: payload?.invoice_date ? new Date(payload.invoice_date) : null,
        paid_method: payload?.paid_method
          ? String(payload.paid_method).toUpperCase()
          : null,
        payment_ref: payload?.payment_ref ? String(payload.payment_ref) : null,
        vat_amount:
          payload?.vat_amount !== undefined && payload?.vat_amount !== null
            ? Number(payload.vat_amount)
            : null,
        invoice_total:
          payload?.invoice_total !== undefined && payload?.invoice_total !== null
            ? Number(payload.invoice_total)
            : null,

        approval_status: "PENDING",
        users_cash_expenses_created_byTousers: { connect: { id: userId } },
      },
      select: {
        id: true,
        payment_source: true,
        expense_type: true,
        amount: true,
        notes: true,
        approval_status: true,
        vehicle_id: true,
        trip_id: true,
        maintenance_work_order_id: true,
        vendor_name: true,
        paid_method: true,
        created_at: true,
      },
    });

    return {
      ok: true,
      executed: true,
      executor: "createExpenseExecutor",
      data: {
        expense: created,
        vehicle: vehicle
          ? {
              id: vehicle.id,
              fleet_no: vehicle.fleet_no || null,
              plate_no: vehicle.plate_no || null,
              display_name: vehicle.display_name || null,
            }
          : null,
        trip: finalTripId ? { id: finalTripId } : null,
        work_order: finalWorkOrderId ? { id: finalWorkOrderId } : null,
      },
    };
  }

  // =======================
  // ADVANCE expense
  // =======================
  let cashAdvanceId = payload?.cash_advance_id || null;

  if (!cashAdvanceId) {
    const openAdvance = await resolveOpenAdvanceForSupervisor(userId);
    if (!openAdvance) {
      return {
        ok: false,
        executed: false,
        message:
          "لا يوجد cash advance مفتوح لهذا المستخدم. يجب تحديد cash_advance_id أو فتح عهدة أولًا.",
        payload,
      };
    }
    cashAdvanceId = openAdvance.id;
  }

  if (!isUuid(cashAdvanceId)) {
    return {
      ok: false,
      executed: false,
      message: "Invalid cash_advance_id",
      payload,
    };
  }

  const advance = await prisma.cash_advances.findUnique({
    where: { id: cashAdvanceId },
    select: {
      id: true,
      status: true,
      field_supervisor_id: true,
    },
  });

  if (!advance || String(advance.status || "").toUpperCase() !== "OPEN") {
    return {
      ok: false,
      executed: false,
      message: "Cash advance not found or not OPEN",
      payload,
    };
  }

  if (advance.field_supervisor_id !== userId) {
    return {
      ok: false,
      executed: false,
      message: "Only the assigned field supervisor can add ADVANCE expenses",
      payload,
    };
  }

  if (finalTripId) {
    const okTrip = await assertTripBelongsToSupervisor({
      trip_id: finalTripId,
      userId,
      vehicle_id: finalVehicleId || null,
    });

    if (!okTrip) {
      return {
        ok: false,
        executed: false,
        message: "You are not allowed to add expenses to this trip",
        payload,
      };
    }
  }

  if (!finalTripId && finalVehicleId) {
    const okVehicle = await assertVehicleInSupervisorPortfolio({
      vehicle_id: finalVehicleId,
      userId,
    });

    if (!okVehicle) {
      return {
        ok: false,
        executed: false,
        message: "You are not allowed to add expenses to this vehicle",
        payload,
      };
    }
  }

  const created = await prisma.cash_expenses.create({
    data: {
      payment_source: "ADVANCE",
      cash_advances: { connect: { id: cashAdvanceId } },

      trips: finalTripId ? { connect: { id: finalTripId } } : undefined,

      vehicles: finalVehicleId
        ? { connect: { id: finalVehicleId } }
        : undefined,

      maintenance_work_orders: finalWorkOrderId
        ? { connect: { id: finalWorkOrderId } }
        : undefined,

      expense_type: expenseType,
      amount,
      notes: notes || null,
      receipt_url: payload?.receipt_url ? String(payload.receipt_url) : null,

      approval_status: "PENDING",
      users_cash_expenses_created_byTousers: { connect: { id: userId } },
    },
    select: {
      id: true,
      payment_source: true,
      cash_advance_id: true,
      expense_type: true,
      amount: true,
      notes: true,
      approval_status: true,
      vehicle_id: true,
      trip_id: true,
      maintenance_work_order_id: true,
      created_at: true,
    },
  });

  return {
    ok: true,
    executed: true,
    executor: "createExpenseExecutor",
    data: {
      expense: created,
      vehicle: vehicle
        ? {
            id: vehicle.id,
            fleet_no: vehicle.fleet_no || null,
            plate_no: vehicle.plate_no || null,
            display_name: vehicle.display_name || null,
          }
        : null,
      cash_advance: {
        id: advance.id,
      },
      trip: finalTripId ? { id: finalTripId } : null,
      work_order: finalWorkOrderId ? { id: finalWorkOrderId } : null,
    },
  };
}

async function runAiExecutor({ action, user, payload }) {
  if (action === "create_maintenance_request") {
    return createMaintenanceRequestExecutor({ user, payload });
  }

  if (action === "create_work_order") {
    return createWorkOrderExecutor({ user, payload });
  }

  if (action === "create_expense") {
    return createExpenseExecutor({ user, payload });
  }

  return {
    ok: false,
    executed: false,
    message: `Unsupported executor action: ${action}`,
    payload,
  };
}

async function executeAiAction({ interpreted, user }) {
  return runAiExecutor({
    action: interpreted?.action,
    user,
    payload: interpreted?.payload || {},
  });
}

module.exports = {
  executeAiAction,
  runAiExecutor,
  createMaintenanceRequestExecutor,
  createWorkOrderExecutor,
  createExpenseExecutor,
};