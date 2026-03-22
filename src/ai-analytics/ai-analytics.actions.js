const prisma = require("../prisma");

// =======================
// Generic Helpers
// =======================
function roleUpper(role) {
  return String(role || "").trim().toUpperCase();
}

function isAdminOrAccountant(role) {
  return ["ADMIN", "ACCOUNTANT"].includes(roleUpper(role));
}

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return cleanText(value)
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

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function normalizePaymentSource(value) {
  const source = String(value || "ADVANCE").toUpperCase();

  if (["COMPANY", "CO", "DIRECT"].includes(source)) return "COMPANY";
  if (["CASH", "ADVANCE", "ADV"].includes(source)) return "ADVANCE";

  return "ADVANCE";
}

function buildError(message, payload, extra = {}) {
  return {
    ok: false,
    executed: false,
    message,
    payload,
    ...extra,
  };
}

function buildSuccess(executor, data) {
  return {
    ok: true,
    executed: true,
    executor,
    data,
  };
}

function buildVehicleSummary(vehicle) {
  if (!vehicle) return null;

  return {
    id: vehicle.id,
    fleet_no: vehicle.fleet_no || null,
    plate_no: vehicle.plate_no || null,
    display_name: vehicle.display_name || null,
  };
}

function buildOptionalRef(id) {
  return id ? { id } : null;
}

function isTripFinancialLocked(financial_status) {
  const status = String(financial_status || "OPEN").toUpperCase();
  return ["IN_REVIEW", "CLOSED"].includes(status);
}

// =======================
// Permission Helpers
// =======================
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
  const where = {
    trip_id,
    field_supervisor_id: userId,
  };

  if (vehicle_id) {
    where.vehicle_id = vehicle_id;
  }

  const row = await prisma.trip_assignments.findFirst({
    where,
    orderBy: { assigned_at: "desc" },
    select: { id: true },
  });

  return !!row;
}

async function assertVehicleAccessForUser({ user, vehicleId, payload }) {
  const userId = getUserId(user);
  const role = user?.role || null;

  if (!userId) {
    return buildError("Unauthorized", payload);
  }

  if (isAdminOrAccountant(role)) {
    return null;
  }

  const allowed = await assertVehicleInSupervisorPortfolio({
    vehicle_id: vehicleId,
    userId,
  });

  if (!allowed) {
    return buildError("Forbidden: vehicle not in your portfolio", payload);
  }

  return null;
}

// =======================
// Resolvers
// =======================
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
    .map((vehicle) => {
      const fleet = normalizeText(vehicle.fleet_no || "");
      const plate = normalizeText(vehicle.plate_no || "");
      const display = normalizeText(vehicle.display_name || "");

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

      return { vehicle, score };
    })
    .filter((item) => item.score > 0)
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
  if (!Number.isFinite(numericId)) {
    return null;
  }

  const candidates = await prisma.trips.findMany({
    take: 20,
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      financial_status: true,
    },
  });

  return candidates.find((item) => String(item.id).includes(String(hint))) || null;
}

async function resolveWorkOrderByHint(workOrderHint) {
  const hint = cleanText(workOrderHint);
  if (!hint) return null;

  if (!isUuid(hint)) {
    return null;
  }

  return prisma.maintenance_work_orders.findUnique({
    where: { id: hint },
    select: {
      id: true,
      vehicle_id: true,
      status: true,
    },
  });
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

async function resolveTripById(tripId) {
  if (!tripId) return null;

  return prisma.trips.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      financial_status: true,
    },
  });
}

async function resolveAdvanceById(advanceId) {
  if (!advanceId) return null;

  return prisma.cash_advances.findUnique({
    where: { id: advanceId },
    select: {
      id: true,
      status: true,
      field_supervisor_id: true,
    },
  });
}

// =======================
// Expense Helpers
// =======================
async function resolveExpenseReferences(payload) {
  const vehicleHint = cleanText(payload?.vehicle_hint || "");
  const tripHint = cleanText(payload?.trip_hint || "");
  const workOrderHint = cleanText(payload?.work_order_hint || "");

  const vehicle = vehicleHint ? await resolveVehicleByHint(vehicleHint) : null;
  const trip = tripHint ? await resolveTripByHint(tripHint) : null;

  const workOrder = workOrderHint
    ? await resolveWorkOrderByHint(workOrderHint)
    : payload?.maintenance_work_order_id
    ? await resolveWorkOrderByHint(payload.maintenance_work_order_id)
    : null;

  const finalTripId =
    payload?.trip_id && isUuid(payload.trip_id)
      ? payload.trip_id
      : trip?.id || null;

  const finalWorkOrderId =
    payload?.maintenance_work_order_id && isUuid(payload.maintenance_work_order_id)
      ? payload.maintenance_work_order_id
      : workOrder?.id || null;

  const finalVehicleId =
    vehicle?.id || workOrder?.vehicle_id || payload?.vehicle_id || null;

  return {
    vehicle,
    trip,
    workOrder,
    finalTripId,
    finalWorkOrderId,
    finalVehicleId,
  };
}

async function validateTripForExpense({ trip, finalTripId, payload }) {
  if (!finalTripId) return null;

  const tripRow = trip || (await resolveTripById(finalTripId));

  if (!tripRow) {
    return buildError("Invalid trip reference", payload);
  }

  if (isTripFinancialLocked(tripRow.financial_status)) {
    return buildError(
      `Trip is financially locked (${tripRow.financial_status})`,
      payload
    );
  }

  return null;
}

function buildCompanyExpenseCreateData({
  userId,
  payload,
  expenseType,
  amount,
  notes,
  finalTripId,
  finalVehicleId,
  finalWorkOrderId,
}) {
  return {
    payment_source: "COMPANY",

    trips: finalTripId ? { connect: { id: finalTripId } } : undefined,
    vehicles: finalVehicleId ? { connect: { id: finalVehicleId } } : undefined,
    maintenance_work_orders: finalWorkOrderId
      ? { connect: { id: finalWorkOrderId } }
      : undefined,

    expense_type: expenseType,
    amount,
    notes: notes || null,
    receipt_url: payload?.receipt_url ? String(payload.receipt_url) : null,

    vendor_name: cleanText(payload?.vendor_name || "AI Created Expense"),
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
    users_cash_expenses_created_byTousers: {
      connect: { id: userId },
    },
  };
}

function buildAdvanceExpenseCreateData({
  userId,
  payload,
  cashAdvanceId,
  expenseType,
  amount,
  notes,
  finalTripId,
  finalVehicleId,
  finalWorkOrderId,
}) {
  return {
    payment_source: "ADVANCE",
    cash_advances: { connect: { id: cashAdvanceId } },

    trips: finalTripId ? { connect: { id: finalTripId } } : undefined,
    vehicles: finalVehicleId ? { connect: { id: finalVehicleId } } : undefined,
    maintenance_work_orders: finalWorkOrderId
      ? { connect: { id: finalWorkOrderId } }
      : undefined,

    expense_type: expenseType,
    amount,
    notes: notes || null,
    receipt_url: payload?.receipt_url ? String(payload.receipt_url) : null,

    approval_status: "PENDING",
    users_cash_expenses_created_byTousers: {
      connect: { id: userId },
    },
  };
}

function buildExpenseResponseData({
  expense,
  vehicle,
  advance,
  finalTripId,
  finalWorkOrderId,
}) {
  return {
    expense,
    vehicle: buildVehicleSummary(vehicle),
    cash_advance: advance ? { id: advance.id } : undefined,
    trip: buildOptionalRef(finalTripId),
    work_order: buildOptionalRef(finalWorkOrderId),
  };
}

async function validateAdvanceExpensePermissions({
  userId,
  advance,
  finalTripId,
  finalVehicleId,
  payload,
}) {
  if (!advance || String(advance.status || "").toUpperCase() !== "OPEN") {
    return buildError("Cash advance not found or not OPEN", payload);
  }

  if (advance.field_supervisor_id !== userId) {
    return buildError(
      "Only the assigned field supervisor can add ADVANCE expenses",
      payload
    );
  }

  if (finalTripId) {
    const allowedTrip = await assertTripBelongsToSupervisor({
      trip_id: finalTripId,
      userId,
      vehicle_id: finalVehicleId || null,
    });

    if (!allowedTrip) {
      return buildError("You are not allowed to add expenses to this trip", payload);
    }
  }

  if (!finalTripId && finalVehicleId) {
    const allowedVehicle = await assertVehicleInSupervisorPortfolio({
      vehicle_id: finalVehicleId,
      userId,
    });

    if (!allowedVehicle) {
      return buildError(
        "You are not allowed to add expenses to this vehicle",
        payload
      );
    }
  }

  return null;
}

// =======================
// REAL Executor: Create Maintenance Request
// =======================
async function createMaintenanceRequestExecutor({ user, payload }) {
  const userId = getUserId(user);
  if (!userId) {
    return buildError("Unauthorized", payload);
  }

  const vehicleHint = cleanText(payload?.vehicle_hint);
  const description = cleanText(payload?.description);
  const problemTitle = cleanText(
    payload?.title || payload?.problem_title || payload?.description
  );

  const vehicle = await resolveVehicleByHint(vehicleHint);
  if (!vehicle) {
    return buildError("Vehicle not found from provided hint", payload);
  }

  const accessError = await assertVehicleAccessForUser({
    user,
    vehicleId: vehicle.id,
    payload,
  });

  if (accessError) {
    return accessError;
  }

  const now = new Date();

  const request = await prisma.maintenance_requests.create({
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

  return buildSuccess("createMaintenanceRequestExecutor", {
    request,
    vehicle: buildVehicleSummary(vehicle),
  });
}

// =======================
// REAL Executor: Create Work Order
// =======================
async function createWorkOrderExecutor({ user, payload }) {
  const userId = getUserId(user);
  if (!userId) {
    return buildError("Unauthorized", payload);
  }

  const vehicleHint = cleanText(payload?.vehicle_hint);
  const title = cleanText(payload?.title || "أعمال صيانة");
  const notes = cleanText(payload?.notes || title);

  const vehicle = await resolveVehicleByHint(vehicleHint);
  if (!vehicle) {
    return buildError("Vehicle not found from provided hint", payload);
  }

  const accessError = await assertVehicleAccessForUser({
    user,
    vehicleId: vehicle.id,
    payload,
  });

  if (accessError) {
    return accessError;
  }

  const now = new Date();

  const workOrder = await prisma.$transaction(async (tx) => {
    const createdWorkOrder = await tx.maintenance_work_orders.create({
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
          work_order_id: createdWorkOrder.id,
          event_type: "CREATE",
          actor_id: userId,
          notes,
          payload: null,
          created_at: now,
        },
      });
    }

    return createdWorkOrder;
  });

  return buildSuccess("createWorkOrderExecutor", {
    work_order: workOrder,
    vehicle: buildVehicleSummary(vehicle),
  });
}

// =======================
// REAL Executor: Create Expense
// =======================
async function createExpenseExecutor({ user, payload }) {
  const userId = getUserId(user);
  if (!userId) {
    return buildError("Unauthorized", payload);
  }

  const role = user?.role || null;
  const isPrivileged = isAdminOrAccountant(role);

  const amount = Number(payload?.amount || 0);
  const expenseType = cleanText(payload?.expense_type);
  const notes = cleanText(payload?.notes || "");
  const paymentSource = normalizePaymentSource(
    payload?.payment_source || (isPrivileged ? "COMPANY" : "ADVANCE")
  );

  if (!expenseType) {
    return buildError("expense_type is required", payload);
  }

  if (!amount || amount <= 0) {
    return buildError("amount must be > 0", payload);
  }

  const {
    vehicle,
    trip,
    workOrder,
    finalTripId,
    finalWorkOrderId,
    finalVehicleId,
  } = await resolveExpenseReferences(payload);

  const tripValidationError = await validateTripForExpense({
    trip,
    finalTripId,
    payload,
  });

  if (tripValidationError) {
    return tripValidationError;
  }

  if (paymentSource === "COMPANY") {
    if (!isPrivileged) {
      return buildError(
        "Only ADMIN or ACCOUNTANT can create COMPANY expenses",
        payload
      );
    }

    const created = await prisma.cash_expenses.create({
      data: buildCompanyExpenseCreateData({
        userId,
        payload,
        expenseType,
        amount,
        notes,
        finalTripId,
        finalVehicleId,
        finalWorkOrderId,
      }),
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

    return buildSuccess("createExpenseExecutor", {
      expense: created,
      vehicle: buildVehicleSummary(vehicle),
      trip: buildOptionalRef(finalTripId),
      work_order: buildOptionalRef(finalWorkOrderId),
    });
  }

  let cashAdvanceId = payload?.cash_advance_id || null;

  if (!cashAdvanceId) {
    const openAdvance = await resolveOpenAdvanceForSupervisor(userId);

    if (!openAdvance) {
      return buildError(
        "لا يوجد cash advance مفتوح لهذا المستخدم. يجب تحديد cash_advance_id أو فتح عهدة أولًا.",
        payload
      );
    }

    cashAdvanceId = openAdvance.id;
  }

  if (!isUuid(cashAdvanceId)) {
    return buildError("Invalid cash_advance_id", payload);
  }

  const advance = await resolveAdvanceById(cashAdvanceId);

  const advancePermissionError = await validateAdvanceExpensePermissions({
    userId,
    advance,
    finalTripId,
    finalVehicleId,
    payload,
  });

  if (advancePermissionError) {
    return advancePermissionError;
  }

  const created = await prisma.cash_expenses.create({
    data: buildAdvanceExpenseCreateData({
      userId,
      payload,
      cashAdvanceId,
      expenseType,
      amount,
      notes,
      finalTripId,
      finalVehicleId,
      finalWorkOrderId,
    }),
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

  return buildSuccess("createExpenseExecutor", buildExpenseResponseData({
    expense: created,
    vehicle,
    advance,
    finalTripId,
    finalWorkOrderId,
  }));
}

// =======================
// Dispatcher
// =======================
async function runAiExecutor({ action, user, payload }) {
  const executors = {
    create_maintenance_request: createMaintenanceRequestExecutor,
    create_work_order: createWorkOrderExecutor,
    create_expense: createExpenseExecutor,
  };

  const executor = executors[action];

  if (!executor) {
    return buildError(`Unsupported executor action: ${action}`, payload);
  }

  return executor({ user, payload });
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