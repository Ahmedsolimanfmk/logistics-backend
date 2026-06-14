const prisma = require("../maintenance/prisma");

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

function withCompany(where = {}, companyId) {
  return {
    ...where,
    company_id: companyId,
  };
}

function buildCompanyConnect(id, companyId) {
  return id
    ? {
        connect: {
          id,
          company_id: companyId,
        },
      }
    : undefined;
}

function requireCompanyId(companyId, payload) {
  if (!companyId) {
    return buildError("companyId is required", payload);
  }
  return null;
}

// =======================
// Permission Helpers
// =======================
async function assertVehicleInSupervisorPortfolio({
  companyId,
  vehicle_id,
  userId,
}) {
  const row = await prisma.vehicle_portfolio.findFirst({
    where: withCompany(
      {
        vehicle_id,
        field_supervisor_id: userId,
        is_active: true,
      },
      companyId
    ),
    select: { id: true },
  });

  return !!row;
}

async function assertTripBelongsToSupervisor({
  companyId,
  trip_id,
  userId,
  vehicle_id,
}) {
  const where = withCompany(
    {
      trip_id,
      field_supervisor_id: userId,
    },
    companyId
  );

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

async function assertVehicleAccessForUser({
  companyId,
  user,
  vehicleId,
  payload,
}) {
  const userId = getUserId(user);
  const role = user?.role || null;

  if (!userId) {
    return buildError("Unauthorized", payload);
  }

  if (isAdminOrAccountant(role)) {
    return null;
  }

  const allowed = await assertVehicleInSupervisorPortfolio({
    companyId,
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
async function resolveVehicleByHint({ companyId, vehicleHint }) {
  const hint = cleanText(vehicleHint);
  if (!hint) return null;

  if (isUuid(hint)) {
    const byId = await prisma.vehicles.findFirst({
      where: withCompany({ id: hint }, companyId),
      select: {
        id: true,
        fleet_no: true,
        plate_no: true,
        display_name: true,
        status: true,
        company_id: true,
      },
    });

    if (byId) return byId;
  }

  const normalizedHint = normalizeText(hint);

  const candidates = await prisma.vehicles.findMany({
    where: {
      company_id: companyId,
    },
    take: 50,
    select: {
      id: true,
      fleet_no: true,
      plate_no: true,
      display_name: true,
      status: true,
      company_id: true,
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

      if (fleet && normalizedHint.includes(fleet)) score = Math.max(score, 70);
      if (plate && normalizedHint.includes(plate)) score = Math.max(score, 70);
      if (display && normalizedHint.includes(display)) score = Math.max(score, 70);

      return { vehicle, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.vehicle || null;
}

async function resolveTripByHint({ companyId, tripHint }) {
  const hint = cleanText(tripHint);
  if (!hint) return null;

  if (isUuid(hint)) {
    const byId = await prisma.trips.findFirst({
      where: withCompany({ id: hint }, companyId),
      select: {
        id: true,
        financial_status: true,
        company_id: true,
      },
    });

    if (byId) return byId;
  }

  const numericId = Number(hint);
  if (!Number.isFinite(numericId)) {
    return null;
  }

  const candidates = await prisma.trips.findMany({
    where: {
      company_id: companyId,
    },
    take: 20,
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      financial_status: true,
      company_id: true,
    },
  });

  return candidates.find((item) => String(item.id).includes(String(hint))) || null;
}

async function resolveWorkOrderByHint({ companyId, workOrderHint }) {
  const hint = cleanText(workOrderHint);
  if (!hint) return null;

  if (!isUuid(hint)) {
    return null;
  }

  return prisma.maintenance_work_orders.findFirst({
    where: withCompany({ id: hint }, companyId),
    select: {
      id: true,
      vehicle_id: true,
      status: true,
      company_id: true,
    },
  });
}

async function resolveOpenAdvanceForSupervisor({ companyId, userId }) {
  return prisma.cash_advances.findFirst({
    where: withCompany(
      {
        field_supervisor_id: userId,
        status: "OPEN",
      },
      companyId
    ),
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      amount: true,
      status: true,
      field_supervisor_id: true,
      company_id: true,
    },
  });
}

async function resolveTripById({ companyId, tripId }) {
  if (!tripId) return null;

  return prisma.trips.findFirst({
    where: withCompany({ id: tripId }, companyId),
    select: {
      id: true,
      financial_status: true,
      company_id: true,
    },
  });
}

async function resolveAdvanceById({ companyId, advanceId }) {
  if (!advanceId) return null;

  return prisma.cash_advances.findFirst({
    where: withCompany({ id: advanceId }, companyId),
    select: {
      id: true,
      status: true,
      field_supervisor_id: true,
      company_id: true,
    },
  });
}

// =======================
// Expense Helpers
// =======================
async function resolveExpenseReferences({ companyId, payload }) {
  const vehicleHint = cleanText(payload?.vehicle_hint || "");
  const tripHint = cleanText(payload?.trip_hint || "");
  const workOrderHint = cleanText(payload?.work_order_hint || "");

  const vehicle = vehicleHint
    ? await resolveVehicleByHint({ companyId, vehicleHint })
    : null;

  const trip = tripHint
    ? await resolveTripByHint({ companyId, tripHint })
    : null;

  const workOrder = workOrderHint
    ? await resolveWorkOrderByHint({ companyId, workOrderHint })
    : payload?.maintenance_work_order_id
    ? await resolveWorkOrderByHint({
        companyId,
        workOrderHint: payload.maintenance_work_order_id,
      })
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

async function validateTripForExpense({
  companyId,
  trip,
  finalTripId,
  payload,
}) {
  if (!finalTripId) return null;

  const tripRow =
    trip ||
    (await resolveTripById({
      companyId,
      tripId: finalTripId,
    }));

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
  companyId,
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
    company_id: companyId,
    payment_source: "COMPANY",

    trips: buildCompanyConnect(finalTripId, companyId),
    vehicles: buildCompanyConnect(finalVehicleId, companyId),
    maintenance_work_orders: buildCompanyConnect(finalWorkOrderId, companyId),

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
  companyId,
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
    company_id: companyId,
    payment_source: "ADVANCE",
    cash_advances: buildCompanyConnect(cashAdvanceId, companyId),

    trips: buildCompanyConnect(finalTripId, companyId),
    vehicles: buildCompanyConnect(finalVehicleId, companyId),
    maintenance_work_orders: buildCompanyConnect(finalWorkOrderId, companyId),

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
  companyId,
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
      companyId,
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
      companyId,
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
async function createMaintenanceRequestExecutor({ companyId, user, payload }) {
  const companyError = requireCompanyId(companyId, payload);
  if (companyError) return companyError;

  const userId = getUserId(user);
  if (!userId) {
    return buildError("Unauthorized", payload);
  }

  const vehicleHint = cleanText(payload?.vehicle_hint);
  const description = cleanText(payload?.description);
  const problemTitle = cleanText(
    payload?.title || payload?.problem_title || payload?.description
  );

  const vehicle = await resolveVehicleByHint({
    companyId,
    vehicleHint,
  });

  if (!vehicle) {
    return buildError("Vehicle not found from provided hint", payload);
  }

  const accessError = await assertVehicleAccessForUser({
    companyId,
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
      company_id: companyId,
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
async function createWorkOrderExecutor({ companyId, user, payload }) {
  const companyError = requireCompanyId(companyId, payload);
  if (companyError) return companyError;

  const userId = getUserId(user);
  if (!userId) {
    return buildError("Unauthorized", payload);
  }

  const vehicleHint = cleanText(payload?.vehicle_hint);
  const title = cleanText(payload?.title || "أعمال صيانة");
  const notes = cleanText(payload?.notes || title);

  const vehicle = await resolveVehicleByHint({
    companyId,
    vehicleHint,
  });

  if (!vehicle) {
    return buildError("Vehicle not found from provided hint", payload);
  }

  const accessError = await assertVehicleAccessForUser({
    companyId,
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
        company_id: companyId,
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

    await tx.vehicles.updateMany({
      where: withCompany({ id: vehicle.id }, companyId),
      data: {
        status: "MAINTENANCE",
        updated_at: now,
      },
    });

    if (tx.maintenance_work_order_events?.create) {
      await tx.maintenance_work_order_events.create({
        data: {
          company_id: companyId,
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
async function createExpenseExecutor({ companyId, user, payload }) {
  const companyError = requireCompanyId(companyId, payload);
  if (companyError) return companyError;

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
  } = await resolveExpenseReferences({
    companyId,
    payload,
  });

  const tripValidationError = await validateTripForExpense({
    companyId,
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
        companyId,
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
        company_id: true,
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
    const openAdvance = await resolveOpenAdvanceForSupervisor({
      companyId,
      userId,
    });

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

  const advance = await resolveAdvanceById({
    companyId,
    advanceId: cashAdvanceId,
  });

  const advancePermissionError = await validateAdvanceExpensePermissions({
    companyId,
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
      companyId,
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
      company_id: true,
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

  return buildSuccess(
    "createExpenseExecutor",
    buildExpenseResponseData({
      expense: created,
      vehicle,
      advance,
      finalTripId,
      finalWorkOrderId,
    })
  );
}

// =======================
// REAL Executor: Create Advance
// =======================
async function createAdvanceExecutor({ companyId, user, payload }) {
  const companyError = requireCompanyId(companyId, payload);
  if (companyError) return companyError;

  const userId = getUserId(user);
  if (!userId) return buildError("Unauthorized", payload);

  const role = user?.role || null;
  if (!isAdminOrAccountant(role)) {
    return buildError("Only ADMIN or ACCOUNTANT can create cash advances via AI", payload);
  }

  const amount = Number(payload?.amount || 0);
  if (!amount || amount <= 0) return buildError("يجب تحديد مبلغ العهدة", payload);

  const assignment = await prisma.supervisor_assignments.findFirst({
    where: { company_id: companyId, is_active: true },
    select: { supervisor_id: true },
  });

  if (!assignment) {
    return buildError("No active supervisor found to assign advance to", payload);
  }

  const created = await prisma.cash_advances.create({
    data: {
      company_id: companyId,
      field_supervisor_id: assignment.supervisor_id,
      issued_by: userId,
      amount,
      currency: "EGP",
      status: "OPEN",
    },
    select: {
      id: true,
      amount: true,
      status: true,
    },
  });

  return buildSuccess("createAdvanceExecutor", {
    cash_advance: created,
  });
}

// =======================
// REAL Executor: Create Trip
// =======================
async function createTripExecutor({ companyId, user, payload }) {
  const companyError = requireCompanyId(companyId, payload);
  if (companyError) return companyError;

  const userId = getUserId(user);
  if (!userId) return buildError("Unauthorized", payload);

  const clientHint = cleanText(payload?.client_hint);
  
  let client = null;
  if (clientHint) {
    client = await prisma.clients.findFirst({
      where: { company_id: companyId, name: { contains: clientHint, mode: "insensitive" }, is_active: true },
      select: { id: true, name: true }
    });
  }

  if (!client) {
    client = await prisma.clients.findFirst({
      where: { company_id: companyId, is_active: true },
      select: { id: true, name: true }
    });
  }

  if (!client) {
    return buildError("No active clients found to create trip", payload);
  }

  const siteHint = cleanText(payload?.site_hint);
  let site = null;

  if (siteHint) {
    site = await prisma.sites.findFirst({
      where: { company_id: companyId, client_id: client.id, name: { contains: siteHint, mode: "insensitive" }, is_active: true },
      select: { id: true, name: true }
    });
  }

  if (!site) {
    site = await prisma.sites.findFirst({
      where: { company_id: companyId, client_id: client.id, is_active: true },
      select: { id: true, name: true }
    });
  }

  if (!site) {
    return buildError("No active sites found for client", payload);
  }

  const tripCode = "TRP-AI-" + Math.floor(Math.random() * 1000000);

  const created = await prisma.trips.create({
    data: {
      company_id: companyId,
      client_id: client.id,
      site_id: site.id,
      created_by: userId,
      trip_code: tripCode,
      status: "DRAFT",
      financial_status: "OPEN",
    },
    select: {
      id: true,
      trip_code: true,
      status: true,
      client: { select: { name: true } },
      site: { select: { name: true } },
    },
  });

  return buildSuccess("createTripExecutor", {
    trip: created,
  });
}

// =======================
// REAL Executor: Assign Driver
// =======================
async function assignTripDriverExecutor({ companyId, user, payload }) {
  const companyError = requireCompanyId(companyId, payload);
  if (companyError) return companyError;

  const tripHint = cleanText(payload?.trip_hint);
  const driverHint = cleanText(payload?.driver_hint);

  if (!tripHint) return buildError("يجب تحديد رقم أو كود الرحلة", payload);
  if (!driverHint) return buildError("يجب تحديد اسم السائق", payload);

  const trip = await resolveTripByHint({ companyId, tripHint });
  if (!trip) return buildError(`لم يتم العثور على رحلة تطابق: ${tripHint}`, payload);

  const driver = await prisma.drivers.findFirst({
    where: { company_id: companyId, full_name: { contains: driverHint, mode: "insensitive" }, status: "ACTIVE" },
    select: { id: true, full_name: true }
  });

  if (!driver) return buildError(`لم يتم العثور على سائق يطابق: ${driverHint}`, payload);

  const existingAssignment = await prisma.trip_assignments.findFirst({
    where: { company_id: companyId, trip_id: trip.id, is_active: true },
    select: { id: true, vehicle_id: true }
  });

  if (!existingAssignment) {
    return buildError("لا توجد مركبة معينة على هذه الرحلة. يرجى تعيين مركبة أولاً.", payload);
  }

  const updated = await prisma.trip_assignments.update({
    where: { id: existingAssignment.id },
    data: { driver_id: driver.id },
    select: { id: true, driver: { select: { full_name: true } } }
  });

  return buildSuccess("assignTripDriverExecutor", {
    trip,
    driver: updated.driver
  });
}

// =======================
// REAL Executor: Issue Part
// =======================
async function issuePartExecutor({ companyId, user, payload }) {
  const companyError = requireCompanyId(companyId, payload);
  if (companyError) return companyError;

  const userId = getUserId(user);
  if (!userId) return buildError("Unauthorized", payload);

  const partHint = cleanText(payload?.part_hint);
  const vehicleHint = cleanText(payload?.vehicle_hint);
  const warehouseHint = cleanText(payload?.warehouse_hint);

  if (!partHint) return buildError("يجب تحديد القطعة المراد صرفها", payload);
  if (!vehicleHint) return buildError("يجب تحديد المركبة", payload);
  if (!warehouseHint) return buildError("يجب تحديد المخزن (مثال: من المخزن الرئيسي)", payload);

  const vehicle = await resolveVehicleByHint({ companyId, vehicleHint });
  if (!vehicle) return buildError(`لم يتم العثور على مركبة: ${vehicleHint}`, payload);

  const part = await prisma.parts.findFirst({
    where: { company_id: companyId, name: { contains: partHint, mode: "insensitive" }, is_active: true },
    select: { id: true, name: true }
  });

  if (!part) return buildError(`لم يتم العثور على قطعة: ${partHint}`, payload);

  const warehouse = await prisma.warehouses.findFirst({
    where: { company_id: companyId, name: { contains: warehouseHint, mode: "insensitive" }, is_active: true },
    select: { id: true, name: true }
  });

  if (!warehouse) return buildError(`لم يتم العثور على مخزن: ${warehouseHint}`, payload);

  const now = new Date();
  
  const workOrder = await prisma.maintenance_work_orders.findFirst({
    where: { company_id: companyId, vehicle_id: vehicle.id, status: "OPEN" },
    select: { id: true }
  });

  if (!workOrder) {
    return buildError("المركبة ليس لديها أمر عمل صيانة مفتوح للصرف عليه.", payload);
  }

  const issue = await prisma.inventory_issues.create({
    data: {
      company_id: companyId,
      work_order_id: workOrder.id,
      warehouse_id: warehouse.id,
      issued_by: userId,
      issued_at: now,
      status: "DRAFT",
      notes: "تم الإنشاء عبر المساعد الذكي",
      inventory_issue_lines: {
        create: [
          {
            company_id: companyId,
            part_id: part.id,
            qty: 1,
            notes: "AI Issue"
          }
        ]
      }
    },
    select: {
      id: true,
      status: true
    }
  });

  return buildSuccess("issuePartExecutor", {
    issue,
    part,
    vehicle: buildVehicleSummary(vehicle),
    warehouse
  });
}

// =======================
// REAL Executor: Create Invoice (AR)
// =======================
async function createInvoiceExecutor({ companyId, user, payload }) {
  const companyError = requireCompanyId(companyId, payload);
  if (companyError) return companyError;

  const userId = getUserId(user);
  if (!userId) return buildError("Unauthorized", payload);

  const clientHint = cleanText(payload?.client_hint);
  if (!clientHint) return buildError("يجب تحديد اسم العميل", payload);

  const amount = Number(payload?.amount || 0);
  if (!amount || amount <= 0) return buildError("يجب تحديد مبلغ الفاتورة", payload);

  const client = await prisma.clients.findFirst({
    where: { company_id: companyId, name: { contains: clientHint, mode: "insensitive" }, is_active: true },
    select: { id: true, name: true }
  });

  if (!client) return buildError(`لم يتم العثور على عميل: ${clientHint}`, payload);

  const invoiceNo = "INV-AI-" + Math.floor(Math.random() * 1000000);

  const created = await prisma.ar_invoices.create({
    data: {
      company_id: companyId,
      client_id: client.id,
      invoice_no: invoiceNo,
      issue_date: new Date(),
      amount: amount,
      total_amount: amount,
      status: "DRAFT",
      created_by: userId,
      notes: "تم الإنشاء عبر المساعد الذكي",
    },
    select: {
      id: true,
      invoice_no: true,
      amount: true,
      status: true,
      client: { select: { name: true } }
    }
  });

  return buildSuccess("createInvoiceExecutor", {
    invoice: created
  });
}

// =======================
// REAL Executor: Create Payment (AR)
// =======================
async function createPaymentExecutor({ companyId, user, payload }) {
  const companyError = requireCompanyId(companyId, payload);
  if (companyError) return companyError;

  const userId = getUserId(user);
  if (!userId) return buildError("Unauthorized", payload);

  const clientHint = cleanText(payload?.client_hint);
  if (!clientHint) return buildError("يجب تحديد اسم العميل", payload);

  const amount = Number(payload?.amount || 0);
  if (!amount || amount <= 0) return buildError("يجب تحديد مبلغ الدفعة", payload);

  const client = await prisma.clients.findFirst({
    where: { company_id: companyId, name: { contains: clientHint, mode: "insensitive" }, is_active: true },
    select: { id: true, name: true }
  });

  if (!client) return buildError(`لم يتم العثور على عميل: ${clientHint}`, payload);

  const created = await prisma.ar_payments.create({
    data: {
      company_id: companyId,
      client_id: client.id,
      payment_date: new Date(),
      amount: amount,
      method: "BANK_TRANSFER",
      status: "DRAFT",
      created_by: userId,
      notes: "سداد محول من البنك (عبر المساعد الذكي)",
    },
    select: {
      id: true,
      amount: true,
      method: true,
      status: true,
      client: { select: { name: true } }
    }
  });

  return buildSuccess("createPaymentExecutor", {
    payment: created
  });
}

// =======================
// Dispatcher
// =======================
async function runAiExecutor({ action, companyId, user, payload }) {
  const executors = {
    create_maintenance_request: createMaintenanceRequestExecutor,
    create_work_order: createWorkOrderExecutor,
    create_expense: createExpenseExecutor,
    create_advance: createAdvanceExecutor,
    create_trip: createTripExecutor,
    assign_trip_driver: assignTripDriverExecutor,
    issue_part: issuePartExecutor,
    create_invoice: createInvoiceExecutor,
    create_payment: createPaymentExecutor,
  };

  const executor = executors[action];

  if (!executor) {
    return buildError(`Unsupported executor action: ${action}`, payload);
  }

  return executor({
    companyId,
    user,
    payload,
  });
}

async function executeAiAction({ interpreted, companyId, user }) {
  return runAiExecutor({
    action: interpreted?.action,
    companyId,
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
  createAdvanceExecutor,
  createTripExecutor,
  assignTripDriverExecutor,
  issuePartExecutor,
  createInvoiceExecutor,
  createPaymentExecutor,
};