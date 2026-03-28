require("dotenv").config();

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function upsertUser(where, data) {
  const existing = await prisma.users.findFirst({ where, select: { id: true } });
  if (existing) {
    return prisma.users.update({
      where: { id: existing.id },
      data,
    });
  }
  return prisma.users.create({ data });
}

async function upsertDepartment(code, data) {
  return prisma.departments.upsert({
    where: { code },
    update: data,
    create: { code, ...data },
  });
}

async function upsertFleet(code, data) {
  return prisma.fleets.upsert({
    where: { code },
    update: data,
    create: { code, ...data },
  });
}

async function upsertClient(name, data) {
  const existing = await prisma.clients.findFirst({
    where: { OR: [{ name }, ...(data.code ? [{ code: data.code }] : [])] },
    select: { id: true },
  });

  if (existing) {
    return prisma.clients.update({
      where: { id: existing.id },
      data: { name, ...data },
    });
  }

  return prisma.clients.create({
    data: { name, ...data },
  });
}

async function upsertSite(clientId, name, data = {}) {
  const existing = await prisma.sites.findFirst({
    where: { client_id: clientId, name },
    select: { id: true },
  });

  if (existing) {
    return prisma.sites.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.sites.create({
    data: {
      client_id: clientId,
      name,
      ...data,
    },
  });
}

async function upsertWarehouse(name, data) {
  const existing = await prisma.warehouses.findFirst({
    where: { OR: [{ name }, ...(data.code ? [{ code: data.code }] : [])] },
    select: { id: true },
  });

  if (existing) {
    return prisma.warehouses.update({
      where: { id: existing.id },
      data: { name, ...data },
    });
  }

  return prisma.warehouses.create({
    data: { name, ...data },
  });
}

async function upsertPart(partNumber, data) {
  return prisma.parts.upsert({
    where: { part_number: partNumber },
    update: data,
    create: { part_number: partNumber, ...data },
  });
}

async function upsertDriver(where, data) {
  const existing = await prisma.drivers.findFirst({ where, select: { id: true } });
  if (existing) {
    return prisma.drivers.update({
      where: { id: existing.id },
      data,
    });
  }
  return prisma.drivers.create({ data });
}

async function upsertVehicle(where, data) {
  const existing = await prisma.vehicles.findFirst({ where, select: { id: true } });
  if (existing) {
    return prisma.vehicles.update({
      where: { id: existing.id },
      data,
    });
  }
  return prisma.vehicles.create({ data });
}

async function ensureFleetVehicle(fleetId, vehicleId, notes) {
  const existing = await prisma.fleet_vehicles.findFirst({
    where: {
      fleet_id: fleetId,
      vehicle_id: vehicleId,
      is_active: true,
    },
    select: { id: true },
  });

  if (!existing) {
    await prisma.fleet_vehicles.create({
      data: {
        fleet_id: fleetId,
        vehicle_id: vehicleId,
        is_active: true,
        notes,
      },
    });
  }
}

async function ensureFleetSiteAssignment(fleetId, siteId, notes) {
  const existing = await prisma.fleet_site_assignments.findFirst({
    where: {
      fleet_id: fleetId,
      site_id: siteId,
      is_active: true,
    },
    select: { id: true },
  });

  if (!existing) {
    await prisma.fleet_site_assignments.create({
      data: {
        fleet_id: fleetId,
        site_id: siteId,
        is_active: true,
        notes,
      },
    });
  }
}

async function ensureSupervisorAssignment(data) {
  const existing = await prisma.supervisor_assignments.findFirst({
    where: {
      supervisor_id: data.supervisor_id,
      department_id: data.department_id ?? null,
      fleet_id: data.fleet_id ?? null,
      site_id: data.site_id ?? null,
      role_scope: data.role_scope,
      is_active: true,
    },
    select: { id: true },
  });

  if (!existing) {
    await prisma.supervisor_assignments.create({
      data: {
        ...data,
        is_active: true,
      },
    });
  }
}

async function main() {
  console.log("=== MASTER DATA SEED START ===");

  const defaultPassword = "Admin@12345";
  const password_hash = await bcrypt.hash(defaultPassword, 10);

  // ---------------------------------------------------------------------------
  // 1) USERS
  // ---------------------------------------------------------------------------
  const users = {};

  users.admin = await upsertUser(
    { email: "admin@logistics.local" },
    {
      employee_code: "EMP-0001",
      full_name: "System Admin",
      phone: "201000000001",
      email: "admin@logistics.local",
      password_hash,
      role: "ADMIN",
      is_active: true,
    }
  );

  users.field1 = await upsertUser(
    { email: "field.supervisor1@logistics.local" },
    {
      employee_code: "EMP-0002",
      full_name: "Field Supervisor One",
      phone: "201000000002",
      email: "field.supervisor1@logistics.local",
      password_hash,
      role: "FIELD_SUPERVISOR",
      is_active: true,
    }
  );

  users.field2 = await upsertUser(
    { email: "field.supervisor2@logistics.local" },
    {
      employee_code: "EMP-0003",
      full_name: "Field Supervisor Two",
      phone: "201000000003",
      email: "field.supervisor2@logistics.local",
      password_hash,
      role: "FIELD_SUPERVISOR",
      is_active: true,
    }
  );

  users.generalSupervisor = await upsertUser(
    { email: "general.supervisor@logistics.local" },
    {
      employee_code: "EMP-0004",
      full_name: "General Supervisor",
      phone: "201000000004",
      email: "general.supervisor@logistics.local",
      password_hash,
      role: "GENERAL_SUPERVISOR",
      is_active: true,
    }
  );

  users.deptManager = await upsertUser(
    { email: "dept.manager@logistics.local" },
    {
      employee_code: "EMP-0005",
      full_name: "Department Manager",
      phone: "201000000005",
      email: "dept.manager@logistics.local",
      password_hash,
      role: "DEPT_MANAGER",
      is_active: true,
    }
  );

  users.contractManager = await upsertUser(
    { email: "contract.manager@logistics.local" },
    {
      employee_code: "EMP-0008",
      full_name: "Contract Manager",
      phone: "201000000008",
      email: "contract.manager@logistics.local",
      password_hash,
      role: "CONTRACT_MANAGER",
      is_active: true,
    }
  );

  users.store1 = await upsertUser(
    { email: "storekeeper1@logistics.local" },
    {
      employee_code: "EMP-0009",
      full_name: "Store Keeper One",
      phone: "201000000009",
      email: "storekeeper1@logistics.local",
      password_hash,
      role: "STOREKEEPER",
      is_active: true,
    }
  );

  users.store2 = await upsertUser(
    { email: "storekeeper2@logistics.local" },
    {
      employee_code: "EMP-0010",
      full_name: "Store Keeper Two",
      phone: "201000000010",
      email: "storekeeper2@logistics.local",
      password_hash,
      role: "STOREKEEPER",
      is_active: true,
    }
  );

  users.accountant = await upsertUser(
    { email: "accountant1@logistics.local" },
    {
      employee_code: "EMP-0012",
      full_name: "Accountant One",
      phone: "201000000012",
      email: "accountant1@logistics.local",
      password_hash,
      role: "ACCOUNTANT",
      is_active: true,
    }
  );

  users.dispatcher = await upsertUser(
    { email: "dispatcher@logistics.local" },
    {
      employee_code: "EMP-0014",
      full_name: "Dispatcher",
      phone: "201000000014",
      email: "dispatcher@logistics.local",
      password_hash,
      role: "DISPATCHER",
      is_active: true,
    }
  );

  users.operations = await upsertUser(
    { email: "operations@logistics.local" },
    {
      employee_code: "EMP-0015",
      full_name: "Operations Officer",
      phone: "201000000015",
      email: "operations@logistics.local",
      password_hash,
      role: "OPERATIONS",
      is_active: true,
    }
  );

  users.maintenanceManager = await upsertUser(
    { email: "maintenance.manager@logistics.local" },
    {
      employee_code: "EMP-0016",
      full_name: "Maintenance Manager",
      phone: "201000000016",
      email: "maintenance.manager@logistics.local",
      password_hash,
      role: "MAINTENANCE_MANAGER",
      is_active: true,
    }
  );

  // ---------------------------------------------------------------------------
  // 2) DEPARTMENTS
  // ---------------------------------------------------------------------------
  const opsDept = await upsertDepartment("OPS", {
    name: "Operations Department",
    description: "Operations and transport execution",
    is_active: true,
  });

  const maintDept = await upsertDepartment("MNT", {
    name: "Maintenance Department",
    description: "Vehicle maintenance and workshop operations",
    is_active: true,
  });

  // ---------------------------------------------------------------------------
  // 3) FLEETS
  // ---------------------------------------------------------------------------
  const fleetNorth = await upsertFleet("FLT-NORTH", {
    department_id: opsDept.id,
    name: "North Fleet",
    description: "Northern operational fleet",
    is_active: true,
  });

  const fleetSouth = await upsertFleet("FLT-SOUTH", {
    department_id: opsDept.id,
    name: "South Fleet",
    description: "Southern operational fleet",
    is_active: true,
  });

  const fleetWorkshop = await upsertFleet("FLT-WORKSHOP", {
    department_id: maintDept.id,
    name: "Workshop Support Fleet",
    description: "Maintenance support vehicles",
    is_active: true,
  });

  // ---------------------------------------------------------------------------
  // 4) CLIENTS
  // ---------------------------------------------------------------------------
  const clientOrascom = await upsertClient("Orascom Construction", {
    code: "CLI-ORASCOM",
    primary_contact_name: "Ahmed Hassan",
    primary_contact_phone: "201111111111",
    primary_contact_email: "ahmed.hassan@orascom.local",
    billing_email: "billing@orascom.local",
    hq_address: "Cairo, Egypt",
    phone: "201111111112",
    tax_no: "TAX-OR-001",
    is_active: true,
  });

  const clientElsewedy = await upsertClient("Elsewedy Electric", {
    code: "CLI-ELSEWEDY",
    primary_contact_name: "Mahmoud Adel",
    primary_contact_phone: "201222222221",
    primary_contact_email: "mahmoud.adel@elsewedy.local",
    billing_email: "billing@elsewedy.local",
    hq_address: "10th of Ramadan, Egypt",
    phone: "201222222222",
    tax_no: "TAX-EL-001",
    is_active: true,
  });

  const clientArab = await upsertClient("Arab Contractors", {
    code: "CLI-ARAB",
    primary_contact_name: "Mostafa Ali",
    primary_contact_phone: "201333333331",
    primary_contact_email: "mostafa.ali@arab.local",
    billing_email: "billing@arab.local",
    hq_address: "Giza, Egypt",
    phone: "201333333332",
    tax_no: "TAX-AC-001",
    is_active: true,
  });

  // ---------------------------------------------------------------------------
  // 5) SITES
  // ---------------------------------------------------------------------------
  const siteNasrCity = await upsertSite(clientOrascom.id, "Nasr City Site", {
    code: "SITE-NASR",
    address: "Nasr City, Cairo",
    is_active: true,
  });

  const siteAinSokhna = await upsertSite(clientOrascom.id, "Ain Sokhna Site", {
    code: "SITE-SOKHNA",
    address: "Ain Sokhna",
    is_active: true,
  });

  const site10th = await upsertSite(clientElsewedy.id, "10th of Ramadan Site", {
    code: "SITE-10TH",
    address: "10th of Ramadan",
    is_active: true,
  });

  const siteOctober = await upsertSite(clientArab.id, "6 October Site", {
    code: "SITE-OCT",
    address: "6 October, Giza",
    is_active: true,
  });

  // ---------------------------------------------------------------------------
  // 6) WAREHOUSES
  // ---------------------------------------------------------------------------
  const mainWarehouse = await upsertWarehouse("Main Warehouse", {
    code: "WH-MAIN",
    location: "Cairo",
    manager_user_id: users.store1.id,
    is_active: true,
  });

  const southWarehouse = await upsertWarehouse("South Warehouse", {
    code: "WH-SOUTH",
    location: "Ain Sokhna",
    manager_user_id: users.store2.id,
    is_active: true,
  });

  // ---------------------------------------------------------------------------
  // 7) PARTS
  // ---------------------------------------------------------------------------
  const partOilFilter = await upsertPart("PART-OF-001", {
    name: "Oil Filter",
    brand: "MANN",
    unit: "PCS",
    tracking_mode: "BULK",
    default_unit_cost: 250,
    min_stock: 20,
    category: "Filters",
    is_consumable: true,
    is_active: true,
  });

  const partBrakePad = await upsertPart("PART-BP-001", {
    name: "Brake Pad Set",
    brand: "Brembo",
    unit: "SET",
    tracking_mode: "BULK",
    default_unit_cost: 1800,
    min_stock: 10,
    category: "Brakes",
    is_consumable: true,
    is_active: true,
  });

  const partBattery = await upsertPart("PART-BAT-001", {
    name: "Truck Battery 150Ah",
    brand: "ACDelco",
    unit: "PCS",
    tracking_mode: "SERIALIZED",
    default_unit_cost: 6500,
    min_stock: 4,
    category: "Electrical",
    is_consumable: false,
    is_active: true,
  });

  const partTire = await upsertPart("PART-TIRE-001", {
    name: "Truck Tire 315/80R22.5",
    brand: "Michelin",
    unit: "PCS",
    tracking_mode: "SERIALIZED",
    default_unit_cost: 14500,
    min_stock: 6,
    category: "Tires",
    is_consumable: false,
    is_active: true,
  });

  // ---------------------------------------------------------------------------
  // 8) DRIVERS
  // ---------------------------------------------------------------------------
  const driver1 = await upsertDriver(
    { phone: "201500000001" },
    {
      employee_code: "DRV-0001",
      full_name: "Mohamed Samir",
      phone: "201500000001",
      phone2: "201500000101",
      national_id: "29901011234567",
      license_no: "LIC-DRV-0001",
      address: "Cairo",
      emergency_contact_name: "Ali Samir",
      emergency_contact_phone: "201500009999",
      hire_date: new Date("2023-01-15T08:00:00.000Z"),
      license_expiry_date: new Date("2027-01-15T08:00:00.000Z"),
      license_issue_date: new Date("2022-01-15T08:00:00.000Z"),
      status: "ACTIVE",
    }
  );

  const driver2 = await upsertDriver(
    { phone: "201500000002" },
    {
      employee_code: "DRV-0002",
      full_name: "Ahmed Reda",
      phone: "201500000002",
      phone2: "201500000102",
      national_id: "29802021234567",
      license_no: "LIC-DRV-0002",
      address: "Giza",
      emergency_contact_name: "Mahmoud Reda",
      emergency_contact_phone: "201500008888",
      hire_date: new Date("2023-03-10T08:00:00.000Z"),
      license_expiry_date: new Date("2027-03-10T08:00:00.000Z"),
      license_issue_date: new Date("2022-03-10T08:00:00.000Z"),
      status: "ACTIVE",
    }
  );

  const driver3 = await upsertDriver(
    { phone: "201500000003" },
    {
      employee_code: "DRV-0003",
      full_name: "Khaled Nabil",
      phone: "201500000003",
      phone2: "201500000103",
      national_id: "29703031234567",
      license_no: "LIC-DRV-0003",
      address: "Suez",
      emergency_contact_name: "Nabil Hassan",
      emergency_contact_phone: "201500007777",
      hire_date: new Date("2022-11-01T08:00:00.000Z"),
      license_expiry_date: new Date("2026-11-01T08:00:00.000Z"),
      license_issue_date: new Date("2021-11-01T08:00:00.000Z"),
      status: "ACTIVE",
    }
  );

  // ---------------------------------------------------------------------------
  // 9) VEHICLES
  // ---------------------------------------------------------------------------
  const vehicle1 = await upsertVehicle(
    { fleet_no: "TRK-001" },
    {
      fleet_no: "TRK-001",
      plate_no: "ABC-1234",
      display_name: "Mercedes Actros 1",
      model: "Mercedes Actros",
      year: 2022,
      current_odometer: 125000,
      gps_device_id: "GPS-0001",
      chassis_no: "CHS-TRK-001",
      engine_no: "ENG-TRK-001",
      ownership_type: "COMPANY_OWNED",
      license_no: "VLIC-0001",
      license_issue_date: new Date("2024-01-01T08:00:00.000Z"),
      license_expiry_date: new Date("2027-01-01T08:00:00.000Z"),
      status: "AVAILABLE",
    }
  );

  const vehicle2 = await upsertVehicle(
    { fleet_no: "TRK-002" },
    {
      fleet_no: "TRK-002",
      plate_no: "ABC-1235",
      display_name: "Volvo FH 2",
      model: "Volvo FH",
      year: 2021,
      current_odometer: 182000,
      gps_device_id: "GPS-0002",
      chassis_no: "CHS-TRK-002",
      engine_no: "ENG-TRK-002",
      ownership_type: "COMPANY_OWNED",
      license_no: "VLIC-0002",
      license_issue_date: new Date("2024-02-01T08:00:00.000Z"),
      license_expiry_date: new Date("2027-02-01T08:00:00.000Z"),
      status: "AVAILABLE",
    }
  );

  const vehicle3 = await upsertVehicle(
    { fleet_no: "TRK-003" },
    {
      fleet_no: "TRK-003",
      plate_no: "ABC-1236",
      display_name: "MAN TGX 3",
      model: "MAN TGX",
      year: 2020,
      current_odometer: 245000,
      gps_device_id: "GPS-0003",
      chassis_no: "CHS-TRK-003",
      engine_no: "ENG-TRK-003",
      ownership_type: "LEASED",
      license_no: "VLIC-0003",
      license_issue_date: new Date("2024-03-01T08:00:00.000Z"),
      license_expiry_date: new Date("2027-03-01T08:00:00.000Z"),
      status: "AVAILABLE",
    }
  );

  const vehicle4 = await upsertVehicle(
    { fleet_no: "MNT-001" },
    {
      fleet_no: "MNT-001",
      plate_no: "ABC-2236",
      display_name: "Workshop Pickup 1",
      model: "Toyota Hilux",
      year: 2023,
      current_odometer: 48000,
      gps_device_id: "GPS-1001",
      chassis_no: "CHS-MNT-001",
      engine_no: "ENG-MNT-001",
      ownership_type: "COMPANY_OWNED",
      license_no: "VLIC-1001",
      license_issue_date: new Date("2024-04-01T08:00:00.000Z"),
      license_expiry_date: new Date("2027-04-01T08:00:00.000Z"),
      status: "AVAILABLE",
    }
  );

  // ---------------------------------------------------------------------------
  // 10) RELATIONS / ASSIGNMENTS
  // ---------------------------------------------------------------------------
  await ensureFleetVehicle(fleetNorth.id, vehicle1.id, "Primary assignment");
  await ensureFleetVehicle(fleetSouth.id, vehicle2.id, "Primary assignment");
  await ensureFleetVehicle(fleetNorth.id, vehicle3.id, "Primary assignment");
  await ensureFleetVehicle(fleetWorkshop.id, vehicle4.id, "Workshop support assignment");

  await ensureFleetSiteAssignment(fleetNorth.id, siteNasrCity.id, "North fleet serves Nasr City");
  await ensureFleetSiteAssignment(fleetNorth.id, siteOctober.id, "North fleet serves 6 October");
  await ensureFleetSiteAssignment(fleetSouth.id, siteAinSokhna.id, "South fleet serves Sokhna");
  await ensureFleetSiteAssignment(fleetSouth.id, site10th.id, "South fleet serves 10th");
  await ensureFleetSiteAssignment(fleetWorkshop.id, siteNasrCity.id, "Workshop support coverage");

  await ensureSupervisorAssignment({
    supervisor_id: users.deptManager.id,
    department_id: opsDept.id,
    role_scope: "DEPARTMENT",
    notes: "Department manager over operations",
  });

  await ensureSupervisorAssignment({
    supervisor_id: users.generalSupervisor.id,
    fleet_id: fleetNorth.id,
    role_scope: "FLEET",
    notes: "General supervisor over North Fleet",
  });

  await ensureSupervisorAssignment({
    supervisor_id: users.field1.id,
    site_id: siteNasrCity.id,
    role_scope: "SITE",
    notes: "Field supervisor for Nasr City site",
  });

  await ensureSupervisorAssignment({
    supervisor_id: users.field2.id,
    fleet_id: fleetSouth.id,
    site_id: siteAinSokhna.id,
    role_scope: "FLEET_SITE",
    notes: "Field supervisor for South Fleet in Ain Sokhna",
  });

  // ---------------------------------------------------------------------------
  // 11) WAREHOUSE STOCK SNAPSHOT
  // ---------------------------------------------------------------------------
  await prisma.warehouse_parts.upsert({
    where: {
      warehouse_id_part_id: {
        warehouse_id: mainWarehouse.id,
        part_id: partOilFilter.id,
      },
    },
    update: {
      qty_on_hand: 50,
      reorder_level: 20,
      max_stock: 100,
    },
    create: {
      warehouse_id: mainWarehouse.id,
      part_id: partOilFilter.id,
      qty_on_hand: 50,
      reorder_level: 20,
      max_stock: 100,
    },
  });

  await prisma.warehouse_parts.upsert({
    where: {
      warehouse_id_part_id: {
        warehouse_id: mainWarehouse.id,
        part_id: partBrakePad.id,
      },
    },
    update: {
      qty_on_hand: 18,
      reorder_level: 10,
      max_stock: 40,
    },
    create: {
      warehouse_id: mainWarehouse.id,
      part_id: partBrakePad.id,
      qty_on_hand: 18,
      reorder_level: 10,
      max_stock: 40,
    },
  });

  await prisma.warehouse_parts.upsert({
    where: {
      warehouse_id_part_id: {
        warehouse_id: southWarehouse.id,
        part_id: partBattery.id,
      },
    },
    update: {
      qty_on_hand: 4,
      reorder_level: 2,
      max_stock: 10,
    },
    create: {
      warehouse_id: southWarehouse.id,
      part_id: partBattery.id,
      qty_on_hand: 4,
      reorder_level: 2,
      max_stock: 10,
    },
  });

  await prisma.warehouse_parts.upsert({
    where: {
      warehouse_id_part_id: {
        warehouse_id: southWarehouse.id,
        part_id: partTire.id,
      },
    },
    update: {
      qty_on_hand: 8,
      reorder_level: 4,
      max_stock: 20,
    },
    create: {
      warehouse_id: southWarehouse.id,
      part_id: partTire.id,
      qty_on_hand: 8,
      reorder_level: 4,
      max_stock: 20,
    },
  });

  console.log("Seeded users, departments, fleets, clients, sites, warehouses, parts, drivers, vehicles, and assignments.");
  console.log("Default seeded user password: Admin@12345");
  console.log("=== MASTER DATA SEED END ===");
}

main()
  .catch((e) => {
    console.error("MASTER DATA SEED FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });