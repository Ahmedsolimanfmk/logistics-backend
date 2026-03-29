require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function getRequiredData() {
  const [
    admin,
    generalSupervisor,
    fieldSupervisor1,
    fieldSupervisor2,
    accountant,
    storeKeeper1,
    maintenanceManager,
    operationsUser,
    northFleet,
    southFleet,
    workshopFleet,
    siteNasr,
    siteSokhna,
    site10th,
    clientOrascom,
    clientElsewedy,
    contractOrascom,
    contractElsewedy,
    vehicle1,
    vehicle2,
    vehicle3,
    driver1,
    driver2,
    driver3,
    mainWarehouse,
    southWarehouse,
    oilFilter,
    brakePad,
    battery,
    tire,
    mainVendor,
    tireVendor,
  ] = await Promise.all([
    prisma.users.findFirst({ where: { email: "admin@logistics.local" } }),
    prisma.users.findFirst({ where: { email: "general.supervisor@logistics.local" } }),
    prisma.users.findFirst({ where: { email: "field.supervisor1@logistics.local" } }),
    prisma.users.findFirst({ where: { email: "field.supervisor2@logistics.local" } }),
    prisma.users.findFirst({ where: { email: "accountant1@logistics.local" } }),
    prisma.users.findFirst({ where: { email: "storekeeper1@logistics.local" } }),
    prisma.users.findFirst({ where: { email: "maintenance.manager@logistics.local" } }),
    prisma.users.findFirst({ where: { email: "operations@logistics.local" } }),

    prisma.fleets.findFirst({ where: { code: "FLT-NORTH" } }),
    prisma.fleets.findFirst({ where: { code: "FLT-SOUTH" } }),
    prisma.fleets.findFirst({ where: { code: "FLT-WORKSHOP" } }),

    prisma.sites.findFirst({ where: { code: "SITE-NASR" } }),
    prisma.sites.findFirst({ where: { code: "SITE-SOKHNA" } }),
    prisma.sites.findFirst({ where: { code: "SITE-10TH" } }),

    prisma.clients.findFirst({ where: { code: "CLI-ORASCOM" } }),
    prisma.clients.findFirst({ where: { code: "CLI-ELSEWEDY" } }),

    prisma.client_contracts.findFirst({ where: { contract_no: "CTR-OR-2026-001" } }),
    prisma.client_contracts.findFirst({ where: { contract_no: "CTR-EL-2026-001" } }),

    prisma.vehicles.findFirst({ where: { fleet_no: "TRK-001" } }),
    prisma.vehicles.findFirst({ where: { fleet_no: "TRK-002" } }),
    prisma.vehicles.findFirst({ where: { fleet_no: "TRK-003" } }),

    prisma.drivers.findFirst({ where: { employee_code: "DRV-0001" } }),
    prisma.drivers.findFirst({ where: { employee_code: "DRV-0002" } }),
    prisma.drivers.findFirst({ where: { employee_code: "DRV-0003" } }),

    prisma.warehouses.findFirst({ where: { code: "WH-MAIN" } }),
    prisma.warehouses.findFirst({ where: { code: "WH-SOUTH" } }),

    prisma.parts.findFirst({ where: { part_number: "PART-OF-001" } }),
    prisma.parts.findFirst({ where: { part_number: "PART-BP-001" } }),
    prisma.parts.findFirst({ where: { part_number: "PART-BAT-001" } }),
    prisma.parts.findFirst({ where: { part_number: "PART-TIRE-001" } }),

    prisma.vendors.findFirst({ where: { code: "VND-MAIN-001" } }),
    prisma.vendors.findFirst({ where: { code: "VND-TIRE-001" } }),
  ]);

  const missing = [
    ["admin", admin],
    ["generalSupervisor", generalSupervisor],
    ["fieldSupervisor1", fieldSupervisor1],
    ["fieldSupervisor2", fieldSupervisor2],
    ["accountant", accountant],
    ["storeKeeper1", storeKeeper1],
    ["maintenanceManager", maintenanceManager],
    ["operationsUser", operationsUser],
    ["northFleet", northFleet],
    ["southFleet", southFleet],
    ["workshopFleet", workshopFleet],
    ["siteNasr", siteNasr],
    ["siteSokhna", siteSokhna],
    ["site10th", site10th],
    ["clientOrascom", clientOrascom],
    ["clientElsewedy", clientElsewedy],
    ["vehicle1", vehicle1],
    ["vehicle2", vehicle2],
    ["vehicle3", vehicle3],
    ["driver1", driver1],
    ["driver2", driver2],
    ["driver3", driver3],
    ["mainWarehouse", mainWarehouse],
    ["southWarehouse", southWarehouse],
    ["oilFilter", oilFilter],
    ["brakePad", brakePad],
    ["battery", battery],
    ["tire", tire],
  ].filter(([, value]) => !value);

  if (missing.length) {
    throw new Error(
      `Missing required seed data: ${missing.map(([name]) => name).join(", ")}`
    );
  }

  return {
    admin,
    generalSupervisor,
    fieldSupervisor1,
    fieldSupervisor2,
    accountant,
    storeKeeper1,
    maintenanceManager,
    operationsUser,
    northFleet,
    southFleet,
    workshopFleet,
    siteNasr,
    siteSokhna,
    site10th,
    clientOrascom,
    clientElsewedy,
    contractOrascom,
    contractElsewedy,
    vehicle1,
    vehicle2,
    vehicle3,
    driver1,
    driver2,
    driver3,
    mainWarehouse,
    southWarehouse,
    oilFilter,
    brakePad,
    battery,
    tire,
    mainVendor,
    tireVendor,
  };
}

async function ensureContracts(data) {
  let contractOrascom = data.contractOrascom;
  let contractElsewedy = data.contractElsewedy;

  if (!contractOrascom) {
    contractOrascom = await prisma.client_contracts.create({
      data: {
        client_id: data.clientOrascom.id,
        contract_no: "CTR-OR-2026-001",
        start_date: new Date("2026-01-01T08:00:00.000Z"),
        end_date: new Date("2026-12-31T08:00:00.000Z"),
        signed_at: new Date("2025-12-20T08:00:00.000Z"),
        billing_cycle: "MONTHLY",
        contract_value: 2500000,
        currency: "EGP",
        status: "ACTIVE",
        notes: "Annual transport contract for Orascom.",
      },
    });
  }

  if (!contractElsewedy) {
    contractElsewedy = await prisma.client_contracts.create({
      data: {
        client_id: data.clientElsewedy.id,
        contract_no: "CTR-EL-2026-001",
        start_date: new Date("2026-01-01T08:00:00.000Z"),
        end_date: new Date("2026-12-31T08:00:00.000Z"),
        signed_at: new Date("2025-12-15T08:00:00.000Z"),
        billing_cycle: "MONTHLY",
        contract_value: 1800000,
        currency: "EGP",
        status: "ACTIVE",
        notes: "Annual transport contract for Elsewedy.",
      },
    });
  }

  return { contractOrascom, contractElsewedy };
}

async function ensureVendors(data) {
  let mainVendor = data.mainVendor;
  let tireVendor = data.tireVendor;

  if (!mainVendor) {
    mainVendor = await prisma.vendors.create({
      data: {
        name: "Main Maintenance Supplies",
        code: "VND-MAIN-001",
        vendor_type: "PARTS_SUPPLIER",
        classification: "EXTERNAL",
        status: "ACTIVE",
        contact_person: "Maher Tarek",
        phone: "201444444441",
        email: "sales@mainvendor.local",
        address: "Cairo",
        currency: "EGP",
      },
    });
  }

  if (!tireVendor) {
    tireVendor = await prisma.vendors.create({
      data: {
        name: "Premium Tire Center",
        code: "VND-TIRE-001",
        vendor_type: "TIRE_SHOP",
        classification: "EXTERNAL",
        status: "ACTIVE",
        contact_person: "Tamer Samy",
        phone: "201444444442",
        email: "sales@tirevendor.local",
        address: "Suez Road",
        currency: "EGP",
      },
    });
  }

  return { mainVendor, tireVendor };
}

async function createTripIfMissing(where, data) {
  const existing = await prisma.trips.findFirst({
    where,
    select: { id: true, trip_code: true },
  });

  if (existing) return existing;

  return prisma.trips.create({ data });
}

async function createTripAssignmentIfMissing(where, data) {
  const existing = await prisma.trip_assignments.findFirst({
    where,
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.trip_assignments.create({ data });
}

async function createTripEventIfMissing(where, data) {
  const existing = await prisma.trip_events.findFirst({
    where,
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.trip_events.create({ data });
}

async function createTripRevenueIfMissing(where, data) {
  const existing = await prisma.trip_revenues.findFirst({
    where,
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.trip_revenues.create({ data });
}

async function createCashAdvanceIfMissing(where, data) {
  const existing = await prisma.cash_advances.findFirst({
    where,
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.cash_advances.create({ data });
}

async function createCashExpenseIfMissing(where, data) {
  const existing = await prisma.cash_expenses.findFirst({
    where,
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.cash_expenses.create({ data });
}

async function createMaintenanceRequestIfMissing(where, data) {
  const existing = await prisma.maintenance_requests.findFirst({
    where,
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.maintenance_requests.create({ data });
}

async function createWorkOrderIfMissing(where, data) {
  const existing = await prisma.maintenance_work_orders.findFirst({
    where,
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.maintenance_work_orders.create({ data });
}

async function createInventoryRequestIfMissing(where, data) {
  const existing = await prisma.inventory_requests.findFirst({
    where,
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.inventory_requests.create({ data });
}

async function createInventoryIssueIfMissing(where, data) {
  const existing = await prisma.inventory_issues.findFirst({
    where,
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.inventory_issues.create({ data });
}

async function createInvoiceIfMissing(where, data) {
  const existing = await prisma.ar_invoices.findFirst({
    where,
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.ar_invoices.create({ data });
}

async function createPaymentIfMissing(where, data) {
  const existing = await prisma.ar_payments.findFirst({
    where,
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.ar_payments.create({ data });
}

async function main() {
  console.log("=== OPERATIONS SEED START ===");

  const base = await getRequiredData();
  const contracts = await ensureContracts(base);
  const vendors = await ensureVendors(base);

  const data = { ...base, ...contracts, ...vendors };

  // ---------------------------------------------------------------------------
  // TRIPS
  // ---------------------------------------------------------------------------
  const trip1 = await createTripIfMissing(
    { trip_code: "TRIP-2026-0001" },
    {
      trip_code: "TRIP-2026-0001",
      client_id: data.clientOrascom.id,
      contract_id: data.contractOrascom.id,
      site_id: data.siteNasr.id,
      created_by: data.operationsUser.id,
      general_supervisor_id: data.generalSupervisor.id,
      scheduled_at: new Date("2026-03-20T06:00:00.000Z"),
      trip_type: "DELIVERY",
      notes: "Cement transport to Nasr City site",
      actual_departure_at: new Date("2026-03-20T06:30:00.000Z"),
      actual_arrival_at: new Date("2026-03-20T08:00:00.000Z"),
      agreed_revenue: 18500,
      cargo_type: "Cement",
      cargo_weight: 22.5,
      destination: "Nasr City Site",
      origin: "Main Yard",
      revenue_currency: "EGP",
      revenue_entry_mode: "CONTRACT",
      status: "COMPLETED",
      financial_status: "UNDER_REVIEW",
    }
  );

  const trip2 = await createTripIfMissing(
    { trip_code: "TRIP-2026-0002" },
    {
      trip_code: "TRIP-2026-0002",
      client_id: data.clientElsewedy.id,
      contract_id: data.contractElsewedy.id,
      site_id: data.site10th.id,
      created_by: data.operationsUser.id,
      general_supervisor_id: data.generalSupervisor.id,
      scheduled_at: new Date("2026-03-22T07:00:00.000Z"),
      trip_type: "DELIVERY",
      notes: "Cable drums transport to 10th of Ramadan",
      actual_departure_at: new Date("2026-03-22T07:15:00.000Z"),
      actual_arrival_at: new Date("2026-03-22T10:10:00.000Z"),
      agreed_revenue: 24500,
      cargo_type: "Cable Drums",
      cargo_weight: 18.2,
      destination: "10th of Ramadan Site",
      origin: "Central Warehouse",
      revenue_currency: "EGP",
      revenue_entry_mode: "CONTRACT",
      status: "COMPLETED",
      financial_status: "OPEN",
    }
  );

  const trip3 = await createTripIfMissing(
    { trip_code: "TRIP-2026-0003" },
    {
      trip_code: "TRIP-2026-0003",
      client_id: data.clientOrascom.id,
      contract_id: data.contractOrascom.id,
      site_id: data.siteSokhna.id,
      created_by: data.operationsUser.id,
      general_supervisor_id: data.generalSupervisor.id,
      scheduled_at: new Date("2026-03-25T05:30:00.000Z"),
      trip_type: "DELIVERY",
      notes: "Steel transport to Ain Sokhna",
      agreed_revenue: 32000,
      cargo_type: "Steel",
      cargo_weight: 28.0,
      destination: "Ain Sokhna Site",
      origin: "Alexandria Port",
      revenue_currency: "EGP",
      revenue_entry_mode: "CONTRACT",
      status: "ASSIGNED",
      financial_status: "OPEN",
    }
  );

  // ---------------------------------------------------------------------------
  // TRIP ASSIGNMENTS
  // ---------------------------------------------------------------------------
  await createTripAssignmentIfMissing(
    { trip_id: trip1.id, vehicle_id: data.vehicle1.id, driver_id: data.driver1.id },
    {
      trip_id: trip1.id,
      vehicle_id: data.vehicle1.id,
      driver_id: data.driver1.id,
      field_supervisor_id: data.fieldSupervisor1.id,
      assigned_at: new Date("2026-03-19T15:00:00.000Z"),
      is_active: false,
      unassigned_at: new Date("2026-03-20T09:00:00.000Z"),
      ended_reason: "Trip completed",
      notes: "Completed assignment",
    }
  );

  await createTripAssignmentIfMissing(
    { trip_id: trip2.id, vehicle_id: data.vehicle2.id, driver_id: data.driver2.id },
    {
      trip_id: trip2.id,
      vehicle_id: data.vehicle2.id,
      driver_id: data.driver2.id,
      field_supervisor_id: data.fieldSupervisor2.id,
      assigned_at: new Date("2026-03-21T16:00:00.000Z"),
      is_active: false,
      unassigned_at: new Date("2026-03-22T11:30:00.000Z"),
      ended_reason: "Trip completed",
      notes: "Completed assignment",
    }
  );

  await createTripAssignmentIfMissing(
    { trip_id: trip3.id, vehicle_id: data.vehicle3.id, driver_id: data.driver3.id },
    {
      trip_id: trip3.id,
      vehicle_id: data.vehicle3.id,
      driver_id: data.driver3.id,
      field_supervisor_id: data.fieldSupervisor2.id,
      assigned_at: new Date("2026-03-24T16:00:00.000Z"),
      is_active: true,
      notes: "Upcoming trip assignment",
    }
  );

  // ---------------------------------------------------------------------------
  // TRIP EVENTS
  // ---------------------------------------------------------------------------
  await createTripEventIfMissing(
    { trip_id: trip1.id, action: "CREATED" },
    {
      trip_id: trip1.id,
      action: "CREATED",
      actor_id: data.operationsUser.id,
      to_status: "DRAFT",
      notes: "Trip created",
    }
  );

  await createTripEventIfMissing(
    { trip_id: trip1.id, action: "APPROVED" },
    {
      trip_id: trip1.id,
      action: "APPROVED",
      actor_id: data.generalSupervisor.id,
      from_status: "DRAFT",
      to_status: "APPROVED",
      notes: "Trip approved",
    }
  );

  await createTripEventIfMissing(
    { trip_id: trip1.id, action: "ASSIGNED" },
    {
      trip_id: trip1.id,
      action: "ASSIGNED",
      actor_id: data.generalSupervisor.id,
      from_status: "APPROVED",
      to_status: "ASSIGNED",
      notes: "Vehicle and driver assigned",
    }
  );

  await createTripEventIfMissing(
    { trip_id: trip1.id, action: "STARTED" },
    {
      trip_id: trip1.id,
      action: "STARTED",
      actor_id: data.fieldSupervisor1.id,
      from_status: "ASSIGNED",
      to_status: "IN_PROGRESS",
      notes: "Trip started",
    }
  );

  await createTripEventIfMissing(
    { trip_id: trip1.id, action: "COMPLETED" },
    {
      trip_id: trip1.id,
      action: "COMPLETED",
      actor_id: data.fieldSupervisor1.id,
      from_status: "IN_PROGRESS",
      to_status: "COMPLETED",
      notes: "Trip completed successfully",
    }
  );

  // ---------------------------------------------------------------------------
  // TRIP REVENUES
  // ---------------------------------------------------------------------------
  const revenue1 = await createTripRevenueIfMissing(
    { trip_id: trip1.id },
    {
      trip_id: trip1.id,
      client_id: data.clientOrascom.id,
      contract_id: data.contractOrascom.id,
      amount: 18500,
      currency: "EGP",
      source: "CONTRACT",
      status: "APPROVED",
      entered_by: data.operationsUser.id,
      approved_by: data.accountant.id,
      entered_at: new Date("2026-03-20T12:00:00.000Z"),
      approved_at: new Date("2026-03-21T08:00:00.000Z"),
      notes: "Revenue for completed trip",
    }
  );

  const revenue2 = await createTripRevenueIfMissing(
    { trip_id: trip2.id },
    {
      trip_id: trip2.id,
      client_id: data.clientElsewedy.id,
      contract_id: data.contractElsewedy.id,
      amount: 24500,
      currency: "EGP",
      source: "CONTRACT",
      status: "DRAFT",
      entered_by: data.operationsUser.id,
      entered_at: new Date("2026-03-22T13:00:00.000Z"),
      notes: "Pending finance approval",
    }
  );

  // ---------------------------------------------------------------------------
  // CASH ADVANCES
  // ---------------------------------------------------------------------------
  const cashAdvance1 = await createCashAdvanceIfMissing(
    { reference_no: "CA-2026-0001" },
    {
      field_supervisor_id: data.fieldSupervisor1.id,
      issued_by: data.accountant.id,
      reference_no: "CA-2026-0001",
      amount: 5000,
      currency: "EGP",
      notes: "Trip petty cash",
      status: "OPEN",
    }
  );

  // ---------------------------------------------------------------------------
  // CASH EXPENSES
  // ---------------------------------------------------------------------------
  await createCashExpenseIfMissing(
    { invoice_no: "EXP-FUEL-0001" },
    {
      cash_advance_id: cashAdvance1.id,
      trip_id: trip1.id,
      vehicle_id: data.vehicle1.id,
      module_source: "TRIP",
      expense_type: "FUEL",
      amount: 2200,
      currency: "EGP",
      notes: "Diesel refill for trip",
      created_by: data.fieldSupervisor1.id,
      approved_by: data.accountant.id,
      approved_at: new Date("2026-03-20T14:00:00.000Z"),
      invoice_date: new Date("2026-03-20T07:00:00.000Z"),
      invoice_no: "EXP-FUEL-0001",
      invoice_total: 2200,
      payment_source: "ADVANCE",
      posting_status: "UNPOSTED",
      approval_status: "APPROVED",
    }
  );

  await createCashExpenseIfMissing(
    { invoice_no: "EXP-TOLL-0001" },
    {
      cash_advance_id: cashAdvance1.id,
      trip_id: trip1.id,
      vehicle_id: data.vehicle1.id,
      module_source: "TRIP",
      expense_type: "TOLL",
      amount: 450,
      currency: "EGP",
      notes: "Road tolls",
      created_by: data.fieldSupervisor1.id,
      approved_by: data.accountant.id,
      approved_at: new Date("2026-03-20T14:10:00.000Z"),
      invoice_date: new Date("2026-03-20T08:30:00.000Z"),
      invoice_no: "EXP-TOLL-0001",
      invoice_total: 450,
      payment_source: "ADVANCE",
      posting_status: "UNPOSTED",
      approval_status: "APPROVED",
    }
  );

  // ---------------------------------------------------------------------------
  // MAINTENANCE
  // ---------------------------------------------------------------------------
  const maintenanceRequest1 = await createMaintenanceRequestIfMissing(
    { problem_title: "Brake noise on TRK-002", vehicle_id: data.vehicle2.id },
    {
      vehicle_id: data.vehicle2.id,
      requested_by: data.fieldSupervisor2.id,
      problem_title: "Brake noise on TRK-002",
      problem_description: "Driver reported strong brake noise during trip",
      priority: "HIGH",
      category: "Brakes",
      requested_at: new Date("2026-03-23T09:00:00.000Z"),
      reviewed_by: data.maintenanceManager.id,
      reviewed_at: new Date("2026-03-23T10:00:00.000Z"),
      status: "APPROVED",
    }
  );

  const workOrder1 = await createWorkOrderIfMissing(
    { request_id: maintenanceRequest1.id },
    {
      vehicle_id: data.vehicle2.id,
      request_id: maintenanceRequest1.id,
      opened_at: new Date("2026-03-23T11:00:00.000Z"),
      started_at: new Date("2026-03-23T12:00:00.000Z"),
      completed_at: new Date("2026-03-23T17:00:00.000Z"),
      created_by: data.maintenanceManager.id,
      approved_by: data.maintenanceManager.id,
      approved_at: new Date("2026-03-23T11:05:00.000Z"),
      maintenance_mode: "INTERNAL",
      status: "COMPLETED",
      type: "CORRECTIVE",
      odometer: 182500,
      notes: "Brake pad replacement completed",
    }
  );

  // ---------------------------------------------------------------------------
  // INVENTORY REQUEST / ISSUE
  // ---------------------------------------------------------------------------
  const inventoryRequest1 = await createInventoryRequestIfMissing(
    { work_order_id: workOrder1.id, warehouse_id: data.mainWarehouse.id },
    {
      warehouse_id: data.mainWarehouse.id,
      work_order_id: workOrder1.id,
      requested_by: data.maintenanceManager.id,
      approved_by: data.storeKeeper1.id,
      approved_at: new Date("2026-03-23T11:30:00.000Z"),
      status: "APPROVED",
      notes: "Required parts for brake maintenance",
    }
  );

  const existingBrakeLine = await prisma.inventory_request_lines.findFirst({
    where: {
      request_id: inventoryRequest1.id,
      part_id: data.brakePad.id,
    },
    select: { id: true },
  });

  if (!existingBrakeLine) {
    await prisma.inventory_request_lines.create({
      data: {
        request_id: inventoryRequest1.id,
        part_id: data.brakePad.id,
        needed_qty: 1,
        reserved_qty: 0,
        issued_qty: 1,
        notes: "Brake pad set",
      },
    });
  }

  const existingOilFilterLine = await prisma.inventory_request_lines.findFirst({
    where: {
      request_id: inventoryRequest1.id,
      part_id: data.oilFilter.id,
    },
    select: { id: true },
  });

  if (!existingOilFilterLine) {
    await prisma.inventory_request_lines.create({
      data: {
        request_id: inventoryRequest1.id,
        part_id: data.oilFilter.id,
        needed_qty: 2,
        reserved_qty: 0,
        issued_qty: 2,
        notes: "Oil filters for preventive service",
      },
    });
  }

  const inventoryIssue1 = await createInventoryIssueIfMissing(
    { work_order_id: workOrder1.id, reference_no: "ISS-2026-0001" },
    {
      work_order_id: workOrder1.id,
      issued_by: data.storeKeeper1.id,
      approved_by: data.storeKeeper1.id,
      approved_at: new Date("2026-03-23T12:00:00.000Z"),
      issued_at: new Date("2026-03-23T12:10:00.000Z"),
      reference_no: "ISS-2026-0001",
      notes: "Parts issued for maintenance work order",
      request_id: inventoryRequest1.id,
      status: "POSTED",
      posted_at: new Date("2026-03-23T12:15:00.000Z"),
      warehouse_id: data.mainWarehouse.id,
    }
  );

  const existingIssueBrake = await prisma.inventory_issue_lines.findFirst({
    where: { issue_id: inventoryIssue1.id, part_id: data.brakePad.id },
    select: { id: true },
  });

  if (!existingIssueBrake) {
    await prisma.inventory_issue_lines.create({
      data: {
        issue_id: inventoryIssue1.id,
        part_id: data.brakePad.id,
        qty: 1,
        unit_cost: 1800,
        total_cost: 1800,
        notes: "Brake pad set issued",
      },
    });
  }

  const existingIssueOil = await prisma.inventory_issue_lines.findFirst({
    where: { issue_id: inventoryIssue1.id, part_id: data.oilFilter.id },
    select: { id: true },
  });

  if (!existingIssueOil) {
    await prisma.inventory_issue_lines.create({
      data: {
        issue_id: inventoryIssue1.id,
        part_id: data.oilFilter.id,
        qty: 2,
        unit_cost: 250,
        total_cost: 500,
        notes: "Oil filters issued",
      },
    });
  }

  // ---------------------------------------------------------------------------
  // WORK ORDER EVENTS
  // ---------------------------------------------------------------------------
  const woCreated = await prisma.maintenance_work_order_events.findFirst({
    where: { work_order_id: workOrder1.id, action: "CREATED" },
    select: { id: true },
  });

  if (!woCreated) {
    await prisma.maintenance_work_order_events.create({
      data: {
        work_order_id: workOrder1.id,
        action: "CREATED",
        to_status: "DRAFT",
        actor_id: data.maintenanceManager.id,
        notes: "Work order created",
      },
    });
  }

  const woCompleted = await prisma.maintenance_work_order_events.findFirst({
    where: { work_order_id: workOrder1.id, action: "COMPLETED" },
    select: { id: true },
  });

  if (!woCompleted) {
    await prisma.maintenance_work_order_events.create({
      data: {
        work_order_id: workOrder1.id,
        action: "COMPLETED",
        from_status: "IN_PROGRESS",
        to_status: "COMPLETED",
        actor_id: data.maintenanceManager.id,
        notes: "Work order completed",
      },
    });
  }

  // ---------------------------------------------------------------------------
  // POST MAINTENANCE REPORT
  // ---------------------------------------------------------------------------
  const existingPostReport = await prisma.post_maintenance_reports.findFirst({
    where: { work_order_id: workOrder1.id },
    select: { id: true },
  });

  if (!existingPostReport) {
    await prisma.post_maintenance_reports.create({
      data: {
        work_order_id: workOrder1.id,
        checked_by: data.maintenanceManager.id,
        checked_at: new Date("2026-03-23T18:00:00.000Z"),
        approved_by: data.maintenanceManager.id,
        approved_at: new Date("2026-03-23T18:15:00.000Z"),
        status: "APPROVED",
        road_test_result: "PASS",
        checklist_json: {
          brakes: "ok",
          suspension: "ok",
          steering: "ok",
        },
        remarks: "Vehicle ready for operation",
      },
    });
  }

  // ---------------------------------------------------------------------------
  // AP / VENDOR TRANSACTION EXAMPLE
  // ---------------------------------------------------------------------------
  await createCashExpenseIfMissing(
    { invoice_no: "MNT-INV-2026-0001" },
    {
      maintenance_work_order_id: workOrder1.id,
      vehicle_id: data.vehicle2.id,
      vendor_id: data.mainVendor.id,
      module_source: "MAINTENANCE",
      expense_type: "MAINTENANCE",
      amount: 1500,
      currency: "EGP",
      notes: "Additional workshop materials",
      created_by: data.maintenanceManager.id,
      approved_by: data.accountant.id,
      approved_at: new Date("2026-03-23T19:00:00.000Z"),
      invoice_date: new Date("2026-03-23T19:00:00.000Z"),
      invoice_no: "MNT-INV-2026-0001",
      invoice_total: 1500,
      payment_source: "COMPANY",
      posting_status: "UNPOSTED",
      approval_status: "APPROVED",
    }
  );

  const maintenanceExpense = await prisma.cash_expenses.findFirst({
    where: { invoice_no: "MNT-INV-2026-0001" },
    select: { id: true },
  });

  if (maintenanceExpense) {
    const existingVendorTx = await prisma.vendor_transactions.findFirst({
      where: {
        related_cash_expense_id: maintenanceExpense.id,
      },
      select: { id: true },
    });

    if (!existingVendorTx) {
      await prisma.vendor_transactions.create({
        data: {
          vendor_id: data.mainVendor.id,
          transaction_type: "INVOICE",
          reference_type: "CASH_EXPENSE",
          amount: 1500,
          currency: "EGP",
          transaction_date: new Date("2026-03-23T19:00:00.000Z"),
          reference_no: "VTX-2026-0001",
          notes: "Vendor ledger entry from maintenance expense",
          related_cash_expense_id: maintenanceExpense.id,
          created_by: data.accountant.id,
          status: "APPROVED",
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // AR INVOICE / PAYMENT
  // ---------------------------------------------------------------------------
  const invoice1 = await createInvoiceIfMissing(
    { invoice_no: "AR-2026-0001" },
    {
      client_id: data.clientOrascom.id,
      contract_id: data.contractOrascom.id,
      invoice_no: "AR-2026-0001",
      issue_date: new Date("2026-03-25T08:00:00.000Z"),
      due_date: new Date("2026-04-24T08:00:00.000Z"),
      amount: 18500,
      vat_amount: 2590,
      total_amount: 21090,
      currency: "EGP",
      status: "APPROVED",
      created_by: data.accountant.id,
      created_at: new Date("2026-03-25T08:00:00.000Z"),
      approved_by: data.accountant.id,
      approved_at: new Date("2026-03-25T09:00:00.000Z"),
      notes: "Invoice for Orascom completed trip",
    }
  );

  const existingInvoiceTripLine = await prisma.ar_invoice_trip_lines.findFirst({
    where: { invoice_id: invoice1.id, trip_id: trip1.id },
    select: { id: true },
  });

  if (!existingInvoiceTripLine) {
    await prisma.ar_invoice_trip_lines.create({
      data: {
        invoice_id: invoice1.id,
        trip_id: trip1.id,
        amount: 18500,
        notes: "Billed completed trip",
      },
    });
  }

  const existingRevenueLink = await prisma.trip_revenues.findFirst({
    where: { id: revenue1.id },
    select: { id: true, invoice_id: true, status: true },
  });

  if (existingRevenueLink && (!existingRevenueLink.invoice_id || existingRevenueLink.status !== "INVOICED")) {
    await prisma.trip_revenues.update({
      where: { id: revenue1.id },
      data: {
        invoice_id: invoice1.id,
        status: "INVOICED",
      },
    });
  }

  const payment1 = await createPaymentIfMissing(
    { reference: "PAY-2026-0001" },
    {
      client_id: data.clientOrascom.id,
      payment_date: new Date("2026-03-28T10:00:00.000Z"),
      amount: 21090,
      currency: "EGP",
      method: "BANK_TRANSFER",
      reference: "PAY-2026-0001",
      notes: "Full payment for AR-2026-0001",
      status: "POSTED",
      created_by: data.accountant.id,
      created_at: new Date("2026-03-28T10:00:00.000Z"),
      submitted_by: data.accountant.id,
      submitted_at: new Date("2026-03-28T10:05:00.000Z"),
      approved_by: data.accountant.id,
      approved_at: new Date("2026-03-28T10:10:00.000Z"),
      posted_by: data.accountant.id,
      posted_at: new Date("2026-03-28T10:15:00.000Z"),
    }
  );

  const existingAllocation = await prisma.ar_payment_allocations.findFirst({
    where: {
      payment_id: payment1.id,
      invoice_id: invoice1.id,
    },
    select: { id: true },
  });

  if (!existingAllocation) {
    await prisma.ar_payment_allocations.create({
      data: {
        payment_id: payment1.id,
        invoice_id: invoice1.id,
        amount_allocated: 21090,admin@logistics.local
      },
    });
  }

  console.log("Seeded trips, assignments, revenues, maintenance, inventory, expenses, vendor transactions, invoices, and payments.");
  console.log("=== OPERATIONS SEED END ===");
}

main()
  .catch((e) => {
    console.error("OPERATIONS SEED FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });