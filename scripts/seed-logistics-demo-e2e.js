require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function money(n) {
  return Number(Number(n).toFixed(2));
}

async function ensureDefaultCompany() {
  const company = await prisma.companies.upsert({
    where: { code: "COMP-DEFAULT" },
    update: {
      name: "Default Company",
      timezone: "Africa/Cairo",
      base_currency: "EGP",
      is_active: true,
      status: "ACTIVE",
    },
    create: {
      code: "COMP-DEFAULT",
      name: "Default Company",
      timezone: "Africa/Cairo",
      base_currency: "EGP",
      is_active: true,
      status: "ACTIVE",
    },
  });

  const existingSubscription = await prisma.company_subscriptions.findFirst({
    where: {
      company_id: company.id,
      plan_code: "DEFAULT",
    },
    select: { id: true },
  });

  if (!existingSubscription) {
    await prisma.company_subscriptions.create({
      data: {
        company_id: company.id,
        plan_code: "DEFAULT",
        status: "ACTIVE",
        starts_at: new Date(),
        ai_enabled: true,
        analytics_enabled: true,
      },
    });
  }

  return company;
}

async function getCompanyActorOrThrow(companyId) {
  const membership = await prisma.company_users.findFirst({
    where: {
      company_id: companyId,
      status: "ACTIVE",
      is_active: true,
    },
    orderBy: { joined_at: "asc" },
    select: {
      user_id: true,
      users: {
        select: {
          id: true,
          full_name: true,
          role: true,
        },
      },
    },
  });

  if (!membership?.user_id) {
    throw new Error(
      "No active company user found. Run seed-default-company + backfill-user-memberships first, or create at least one company user."
    );
  }

  return membership.user_id;
}

async function ensureClient({ companyId, code, name, phone, email, tax_no }) {
  const existing = await prisma.clients.findFirst({
    where: { company_id: companyId, code },
  });

  if (existing) {
    return prisma.clients.update({
      where: { id: existing.id },
      data: {
        name,
        phone,
        billing_email: email,
        tax_no,
        is_active: true,
      },
    });
  }

  return prisma.clients.create({
    data: {
      company_id: companyId,
      code,
      name,
      phone,
      billing_email: email,
      tax_no,
      is_active: true,
      primary_contact_name: `${name} Contact`,
      primary_contact_phone: phone,
      primary_contact_email: email,
      hq_address: `${name} HQ`,
      notes: "Seeded demo client",
    },
  });
}

async function ensureZone({ companyId, code, name }) {
  return prisma.zones.upsert({
    where: {
      company_id_code: {
        company_id: companyId,
        code,
      },
    },
    update: {
      name,
      is_active: true,
    },
    create: {
      company_id: companyId,
      code,
      name,
      is_active: true,
    },
  });
}

async function ensureVehicleClass({ companyId, code, name, description }) {
  return prisma.vehicle_classes.upsert({
    where: {
      company_id_code: {
        company_id: companyId,
        code,
      },
    },
    update: {
      name,
      description,
      is_active: true,
    },
    create: {
      company_id: companyId,
      code,
      name,
      description,
      is_active: true,
    },
  });
}

async function ensureCargoType({ companyId, code, name, description }) {
  return prisma.cargo_types.upsert({
    where: {
      company_id_code: {
        company_id: companyId,
        code,
      },
    },
    update: {
      name,
      description,
      is_active: true,
    },
    create: {
      company_id: companyId,
      code,
      name,
      description,
      is_active: true,
    },
  });
}

async function ensureSite({
  companyId,
  clientId,
  zoneId,
  code,
  name,
  address,
}) {
  const existing = await prisma.sites.findFirst({
    where: {
      company_id: companyId,
      client_id: clientId,
      name,
    },
  });

  if (existing) {
    return prisma.sites.update({
      where: { id: existing.id },
      data: {
        code,
        zone_id: zoneId,
        address,
        is_active: true,
      },
    });
  }

  return prisma.sites.create({
    data: {
      company_id: companyId,
      client_id: clientId,
      zone_id: zoneId,
      code,
      name,
      address,
      is_active: true,
    },
  });
}

async function ensureContract({
  clientId,
  contractNo,
  startDate,
  endDate,
  contractValue,
  notes,
}) {
  const existing = await prisma.client_contracts.findFirst({
    where: { contract_no: contractNo },
  });

  if (existing) {
    return prisma.client_contracts.update({
      where: { id: existing.id },
      data: {
        client_id: clientId,
        start_date: startDate,
        end_date: endDate,
        contract_value: contractValue,
        currency: "EGP",
        billing_cycle: "MONTHLY",
        status: "ACTIVE",
        notes,
      },
    });
  }

  return prisma.client_contracts.create({
    data: {
      client_id: clientId,
      contract_no: contractNo,
      start_date: startDate,
      end_date: endDate,
      signed_at: startDate,
      billing_cycle: "MONTHLY",
      contract_value: contractValue,
      currency: "EGP",
      status: "ACTIVE",
      notes,
    },
  });
}

async function ensureRoute({
  companyId,
  clientId,
  code,
  name,
  pickupSiteId,
  dropoffSiteId,
  originLabel,
  destinationLabel,
  distanceKm,
  notes,
}) {
  const existing = await prisma.routes.findFirst({
    where: {
      company_id: companyId,
      code,
    },
  });

  if (existing) {
    return prisma.routes.update({
      where: { id: existing.id },
      data: {
        client_id: clientId,
        name,
        pickup_site_id: pickupSiteId,
        dropoff_site_id: dropoffSiteId,
        origin_label: originLabel,
        destination_label: destinationLabel,
        distance_km: distanceKm,
        notes,
        is_active: true,
      },
    });
  }

  return prisma.routes.create({
    data: {
      company_id: companyId,
      client_id: clientId,
      code,
      name,
      pickup_site_id: pickupSiteId,
      dropoff_site_id: dropoffSiteId,
      origin_label: originLabel,
      destination_label: destinationLabel,
      distance_km: distanceKm,
      notes,
      is_active: true,
    },
  });
}

async function ensurePricingRule({
  companyId,
  clientId,
  contractId,
  routeId,
  pickupSiteId,
  dropoffSiteId,
  fromZoneId,
  toZoneId,
  vehicleClassId,
  cargoTypeId,
  tripType,
  basePrice,
  pricePerKm,
  pricePerTon,
  priority,
  notes,
}) {
  const existing = await prisma.contract_pricing_rules.findFirst({
    where: {
      company_id: companyId,
      contract_id: contractId,
      client_id: clientId,
      route_id: routeId || null,
      pickup_site_id: pickupSiteId || null,
      dropoff_site_id: dropoffSiteId || null,
      from_zone_id: fromZoneId || null,
      to_zone_id: toZoneId || null,
      vehicle_class_id: vehicleClassId || null,
      cargo_type_id: cargoTypeId || null,
      trip_type: tripType || null,
      notes,
    },
  });

  const data = {
    company_id: companyId,
    contract_id: contractId,
    client_id: clientId,
    route_id: routeId || null,
    pickup_site_id: pickupSiteId || null,
    dropoff_site_id: dropoffSiteId || null,
    from_zone_id: fromZoneId || null,
    to_zone_id: toZoneId || null,
    vehicle_class_id: vehicleClassId || null,
    cargo_type_id: cargoTypeId || null,
    trip_type: tripType || null,
    base_price: money(basePrice),
    currency: "EGP",
    price_per_km: pricePerKm == null ? null : money(pricePerKm),
    price_per_ton: pricePerTon == null ? null : money(pricePerTon),
    priority,
    is_active: true,
    effective_from: new Date("2026-01-01T00:00:00.000Z"),
    notes,
  };

  if (existing) {
    return prisma.contract_pricing_rules.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.contract_pricing_rules.create({ data });
}

async function ensureVehicle({
  companyId,
  fleetNo,
  plateNo,
  model,
  year,
}) {
  const existing = await prisma.vehicles.findFirst({
    where: {
      company_id: companyId,
      fleet_no: fleetNo,
    },
  });

  if (existing) {
    return prisma.vehicles.update({
      where: { id: existing.id },
      data: {
        plate_no: plateNo,
        model,
        year,
        display_name: `${fleetNo} - ${plateNo}`,
        status: "AVAILABLE",
      },
    });
  }

  return prisma.vehicles.create({
    data: {
      company_id: companyId,
      fleet_no: fleetNo,
      plate_no: plateNo,
      model,
      year,
      display_name: `${fleetNo} - ${plateNo}`,
      ownership_type: "COMPANY_OWNED",
      status: "AVAILABLE",
    },
  });
}

async function ensureDriver({
  companyId,
  employeeCode,
  fullName,
  phone,
  licenseNo,
}) {
  const existing = await prisma.drivers.findFirst({
    where: {
      company_id: companyId,
      employee_code: employeeCode,
    },
  });

  if (existing) {
    return prisma.drivers.update({
      where: { id: existing.id },
      data: {
        full_name: fullName,
        phone,
        license_no: licenseNo,
        status: "ACTIVE",
      },
    });
  }

  return prisma.drivers.create({
    data: {
      company_id: companyId,
      employee_code: employeeCode,
      full_name: fullName,
      phone,
      license_no: licenseNo,
      status: "ACTIVE",
    },
  });
}

async function ensureTrip({
  companyId,
  tripCode,
  clientId,
  siteId,
  contractId,
  createdBy,
  supervisorId,
  scheduledAt,
  tripType,
  cargoType,
  cargoWeight,
  origin,
  destination,
  agreedRevenue,
  status,
  financialStatus,
  revenueEntryMode,
  closed,
}) {
  const existing = await prisma.trips.findFirst({
    where: {
      company_id: companyId,
      trip_code: tripCode,
    },
  });

  const data = {
    company_id: companyId,
    client_id: clientId,
    site_id: siteId,
    contract_id: contractId,
    created_by: createdBy,
    general_supervisor_id: supervisorId || null,
    scheduled_at: scheduledAt,
    trip_type: tripType,
    cargo_type: cargoType,
    cargo_weight: cargoWeight == null ? null : Number(cargoWeight),
    origin,
    destination,
    agreed_revenue: money(agreedRevenue),
    revenue_currency: "EGP",
    revenue_entry_mode: revenueEntryMode || "CONTRACT",
    status,
    financial_status: financialStatus,
    notes: "Seeded demo trip",
    actual_departure_at:
      status === "IN_PROGRESS" || status === "COMPLETED"
        ? addDays(scheduledAt, 0)
        : null,
    actual_arrival_at: status === "COMPLETED" ? addDays(scheduledAt, 1) : null,
    financial_review_opened_at:
      financialStatus === "UNDER_REVIEW" || financialStatus === "CLOSED"
        ? addDays(scheduledAt, 2)
        : null,
    financial_closed_at: closed ? addDays(scheduledAt, 3) : null,
    financial_closed_by: closed ? createdBy : null,
    closed_notes: closed ? "Closed by demo seed" : null,
  };

  if (existing) {
    return prisma.trips.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.trips.create({
    data: {
      trip_code: tripCode,
      ...data,
    },
  });
}

async function ensureTripAssignment({
  companyId,
  tripId,
  vehicleId,
  driverId,
  fieldSupervisorId,
  active,
}) {
  const existing = await prisma.trip_assignments.findFirst({
    where: {
      trip_id: tripId,
      vehicle_id: vehicleId,
      driver_id: driverId,
      is_active: true,
    },
  });

  if (existing) return existing;

  return prisma.trip_assignments.create({
    data: {
      company_id: companyId,
      trip_id: tripId,
      vehicle_id: vehicleId,
      driver_id: driverId,
      field_supervisor_id: fieldSupervisorId || null,
      assigned_at: new Date(),
      is_active: active,
    },
  });
}

async function ensureTripEvent({
  companyId,
  tripId,
  action,
  fromStatus,
  toStatus,
  actorId,
  notes,
}) {
  const existing = await prisma.trip_events.findFirst({
    where: {
      company_id: companyId,
      trip_id: tripId,
      action,
      to_status: toStatus || null,
      notes: notes || null,
    },
  });

  if (existing) return existing;

  return prisma.trip_events.create({
    data: {
      company_id: companyId,
      trip_id: tripId,
      action,
      from_status: fromStatus || null,
      to_status: toStatus || null,
      actor_id: actorId || null,
      notes: notes || null,
    },
  });
}

async function ensureTripRevenue({
  companyId,
  tripId,
  clientId,
  contractId,
  amount,
  enteredBy,
  approvedBy,
  notes,
}) {
  const existing = await prisma.trip_revenues.findFirst({
    where: {
      company_id: companyId,
      trip_id: tripId,
      source: "CONTRACT",
    },
  });

  const data = {
    company_id: companyId,
    trip_id: tripId,
    client_id: clientId,
    contract_id: contractId || null,
    amount: money(amount),
    currency: "EGP",
    source: "CONTRACT",
    status: "APPROVED",
    entered_by: enteredBy || null,
    approved_by: approvedBy || null,
    approved_at: new Date(),
    notes: notes || "Seeded contract revenue",
  };

  if (existing) {
    return prisma.trip_revenues.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.trip_revenues.create({ data });
}

async function ensureInvoice({
  companyId,
  clientId,
  contractId,
  invoiceNo,
  issueDate,
  dueDate,
  amount,
  vatAmount,
  status,
  createdBy,
}) {
  const totalAmount = money(amount + vatAmount);

  const existing = await prisma.ar_invoices.findFirst({
    where: { invoice_no: invoiceNo },
  });

  const data = {
    company_id: companyId,
    client_id: clientId,
    contract_id: contractId || null,
    issue_date: issueDate,
    due_date: dueDate,
    amount: money(amount),
    vat_amount: money(vatAmount),
    total_amount: totalAmount,
    currency: "EGP",
    status,
    created_by: createdBy || null,
    approved_by: createdBy || null,
    approved_at: status === "APPROVED" || status === "PARTIALLY_PAID" || status === "PAID"
      ? issueDate
      : null,
    notes: "Seeded demo invoice",
  };

  if (existing) {
    return prisma.ar_invoices.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.ar_invoices.create({
    data: {
      invoice_no: invoiceNo,
      ...data,
    },
  });
}

async function ensureInvoiceTripLine({
  companyId,
  invoiceId,
  tripId,
  amount,
}) {
  const existing = await prisma.ar_invoice_trip_lines.findFirst({
    where: {
      invoice_id: invoiceId,
      trip_id: tripId,
    },
  });

  if (existing) {
    return prisma.ar_invoice_trip_lines.update({
      where: { id: existing.id },
      data: {
        company_id: companyId,
        amount: money(amount),
      },
    });
  }

  return prisma.ar_invoice_trip_lines.create({
    data: {
      company_id: companyId,
      invoice_id: invoiceId,
      trip_id: tripId,
      amount: money(amount),
    },
  });
}

async function ensurePayment({
  companyId,
  clientId,
  amount,
  paymentDate,
  reference,
  createdBy,
  status,
}) {
  const existing = await prisma.ar_payments.findFirst({
    where: {
      company_id: companyId,
      client_id: clientId,
      reference,
    },
  });

  const data = {
    company_id: companyId,
    client_id: clientId,
    payment_date: paymentDate,
    amount: money(amount),
    currency: "EGP",
    method: "BANK_TRANSFER",
    reference,
    status,
    created_by: createdBy || null,
    approved_by: createdBy || null,
    approved_at:
      status === "APPROVED" || status === "POSTED" ? paymentDate : null,
    posted_by: status === "POSTED" ? createdBy || null : null,
    posted_at: status === "POSTED" ? paymentDate : null,
    notes: "Seeded demo payment",
  };

  if (existing) {
    return prisma.ar_payments.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.ar_payments.create({ data });
}

async function ensureAllocation({
  companyId,
  paymentId,
  invoiceId,
  amountAllocated,
}) {
  const existing = await prisma.ar_payment_allocations.findFirst({
    where: {
      payment_id: paymentId,
      invoice_id: invoiceId,
    },
  });

  if (existing) {
    return prisma.ar_payment_allocations.update({
      where: { id: existing.id },
      data: {
        company_id: companyId,
        amount_allocated: money(amountAllocated),
      },
    });
  }

  return prisma.ar_payment_allocations.create({
    data: {
      company_id: companyId,
      payment_id: paymentId,
      invoice_id: invoiceId,
      amount_allocated: money(amountAllocated),
    },
  });
}

async function ensureCashAdvance({
  companyId,
  fieldSupervisorId,
  issuedBy,
  referenceNo,
  amount,
  status,
}) {
  const existing = await prisma.cash_advances.findFirst({
    where: {
      company_id: companyId,
      reference_no: referenceNo,
    },
  });

  const data = {
    company_id: companyId,
    field_supervisor_id: fieldSupervisorId,
    issued_by: issuedBy,
    reference_no: referenceNo,
    amount: money(amount),
    currency: "EGP",
    status,
    notes: "Seeded demo cash advance",
  };

  if (existing) {
    return prisma.cash_advances.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.cash_advances.create({ data });
}

async function ensureCashExpense({
  companyId,
  cashAdvanceId,
  tripId,
  vehicleId,
  createdBy,
  amount,
  expenseType,
  approvalStatus,
  notes,
}) {
  const existing = await prisma.cash_expenses.findFirst({
    where: {
      company_id: companyId,
      trip_id: tripId || null,
      expense_type: expenseType,
      amount: money(amount),
      notes,
    },
  });

  const data = {
    company_id: companyId,
    cash_advance_id: cashAdvanceId || null,
    trip_id: tripId || null,
    vehicle_id: vehicleId || null,
    module_source: tripId ? "TRIP" : "GENERAL",
    expense_type: expenseType,
    amount: money(amount),
    currency: "EGP",
    created_by: createdBy,
    approval_status: approvalStatus,
    notes,
    approved_by:
      approvalStatus === "APPROVED" ? createdBy : null,
    approved_at:
      approvalStatus === "APPROVED" ? new Date() : null,
  };

  if (existing) {
    return prisma.cash_expenses.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.cash_expenses.create({ data });
}

async function main() {
  console.log("=== SEED LOGISTICS DEMO E2E START ===");

  const company = await ensureDefaultCompany();
  const companyId = company.id;

  const actorUserId = await getCompanyActorOrThrow(companyId);

  console.log("Using company:", companyId);
  console.log("Using actor user:", actorUserId);

  const [
    zoneCairo,
    zoneAlex,
    zoneSuez,
    zoneDelta,
  ] = await Promise.all([
    ensureZone({ companyId, code: "CAIRO", name: "القاهرة" }),
    ensureZone({ companyId, code: "ALEX", name: "الإسكندرية" }),
    ensureZone({ companyId, code: "SUEZ", name: "السويس" }),
    ensureZone({ companyId, code: "DELTA", name: "الدلتا" }),
  ]);

  const [
    vcTrailer,
    vcTruck,
    vcHalfTruck,
  ] = await Promise.all([
    ensureVehicleClass({
      companyId,
      code: "TRAILER",
      name: "تريلا",
      description: "تريلا حمولة كبيرة",
    }),
    ensureVehicleClass({
      companyId,
      code: "TRUCK",
      name: "نقل ثقيل",
      description: "شاحنة نقل ثقيل",
    }),
    ensureVehicleClass({
      companyId,
      code: "HALF_TRUCK",
      name: "نصف نقل",
      description: "شاحنة نصف نقل",
    }),
  ]);

  const [
    ctGeneral,
    ctBulk,
    ctContainer,
  ] = await Promise.all([
    ensureCargoType({
      companyId,
      code: "GENERAL",
      name: "بضائع عامة",
      description: "منقولات عامة",
    }),
    ensureCargoType({
      companyId,
      code: "BULK",
      name: "مواد سائبة",
      description: "أسمنت ورمال وخامات",
    }),
    ensureCargoType({
      companyId,
      code: "CONTAINER",
      name: "حاويات",
      description: "حاويات 20/40 قدم",
    }),
  ]);

  const acme = await ensureClient({
    companyId,
    code: "CLI-ACME",
    name: "شركة ACME للتوريدات",
    phone: "01000000001",
    email: "acme@example.com",
    tax_no: "TAX-ACME-001",
  });

  const beta = await ensureClient({
    companyId,
    code: "CLI-BETA",
    name: "شركة BETA للصناعات",
    phone: "01000000002",
    email: "beta@example.com",
    tax_no: "TAX-BETA-001",
  });

  const acmeCairo = await ensureSite({
    companyId,
    clientId: acme.id,
    zoneId: zoneCairo.id,
    code: "AC-CAI-WH",
    name: "مخزن القاهرة - ACME",
    address: "القاهرة الجديدة",
  });

  const acmeAlex = await ensureSite({
    companyId,
    clientId: acme.id,
    zoneId: zoneAlex.id,
    code: "AC-ALX-PORT",
    name: "ميناء الإسكندرية - ACME",
    address: "ميناء الإسكندرية",
  });

  const beta10th = await ensureSite({
    companyId,
    clientId: beta.id,
    zoneId: zoneCairo.id,
    code: "BT-10TH-WH",
    name: "مخزن العاشر - BETA",
    address: "العاشر من رمضان",
  });

  const betaSokhna = await ensureSite({
    companyId,
    clientId: beta.id,
    zoneId: zoneSuez.id,
    code: "BT-SOKHNA-PORT",
    name: "ميناء السخنة - BETA",
    address: "العين السخنة",
  });

  const acmeContract = await ensureContract({
    clientId: acme.id,
    contractNo: "CTR-ACME-2026-001",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-12-31T00:00:00.000Z"),
    contractValue: 2500000,
    notes: "Annual transport contract for ACME",
  });

  const betaContract = await ensureContract({
    clientId: beta.id,
    contractNo: "CTR-BETA-2026-001",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-12-31T00:00:00.000Z"),
    contractValue: 1800000,
    notes: "Annual transport contract for BETA",
  });

  const routeAcmeCairoAlex = await ensureRoute({
    companyId,
    clientId: acme.id,
    code: "R-ACME-CAI-ALX",
    name: "القاهرة → الإسكندرية",
    pickupSiteId: acmeCairo.id,
    dropoffSiteId: acmeAlex.id,
    originLabel: "مخزن القاهرة",
    destinationLabel: "ميناء الإسكندرية",
    distanceKm: 220,
    notes: "ACME standard northbound route",
  });

  const routeAcmeAlexCairo = await ensureRoute({
    companyId,
    clientId: acme.id,
    code: "R-ACME-ALX-CAI",
    name: "الإسكندرية → القاهرة",
    pickupSiteId: acmeAlex.id,
    dropoffSiteId: acmeCairo.id,
    originLabel: "ميناء الإسكندرية",
    destinationLabel: "مخزن القاهرة",
    distanceKm: 220,
    notes: "ACME return route",
  });

  const routeBeta10thSokhna = await ensureRoute({
    companyId,
    clientId: beta.id,
    code: "R-BETA-10TH-SOK",
    name: "العاشر → السخنة",
    pickupSiteId: beta10th.id,
    dropoffSiteId: betaSokhna.id,
    originLabel: "مخزن العاشر",
    destinationLabel: "ميناء السخنة",
    distanceKm: 140,
    notes: "BETA port supply route",
  });

  const routeBetaSokhna10th = await ensureRoute({
    companyId,
    clientId: beta.id,
    code: "R-BETA-SOK-10TH",
    name: "السخنة → العاشر",
    pickupSiteId: betaSokhna.id,
    dropoffSiteId: beta10th.id,
    originLabel: "ميناء السخنة",
    destinationLabel: "مخزن العاشر",
    distanceKm: 140,
    notes: "BETA reverse route",
  });

  await Promise.all([
    ensurePricingRule({
      companyId,
      clientId: acme.id,
      contractId: acmeContract.id,
      routeId: routeAcmeCairoAlex.id,
      pickupSiteId: acmeCairo.id,
      dropoffSiteId: acmeAlex.id,
      fromZoneId: zoneCairo.id,
      toZoneId: zoneAlex.id,
      vehicleClassId: vcTrailer.id,
      cargoTypeId: ctContainer.id,
      tripType: "DELIVERY",
      basePrice: 8500,
      pricePerKm: 18,
      pricePerTon: 120,
      priority: 10,
      notes: "DEMO-ACME-ROUTE-TRAILER-CONTAINER",
    }),
    ensurePricingRule({
      companyId,
      clientId: acme.id,
      contractId: acmeContract.id,
      routeId: null,
      pickupSiteId: null,
      dropoffSiteId: null,
      fromZoneId: zoneCairo.id,
      toZoneId: zoneAlex.id,
      vehicleClassId: vcTruck.id,
      cargoTypeId: ctGeneral.id,
      tripType: "TRANSFER",
      basePrice: 6200,
      pricePerKm: 14,
      pricePerTon: 90,
      priority: 100,
      notes: "DEMO-ACME-ZONE-FALLBACK",
    }),
    ensurePricingRule({
      companyId,
      clientId: beta.id,
      contractId: betaContract.id,
      routeId: routeBeta10thSokhna.id,
      pickupSiteId: beta10th.id,
      dropoffSiteId: betaSokhna.id,
      fromZoneId: zoneCairo.id,
      toZoneId: zoneSuez.id,
      vehicleClassId: vcTrailer.id,
      cargoTypeId: ctBulk.id,
      tripType: "DELIVERY",
      basePrice: 7100,
      pricePerKm: 16,
      pricePerTon: 110,
      priority: 10,
      notes: "DEMO-BETA-ROUTE-TRAILER-BULK",
    }),
    ensurePricingRule({
      companyId,
      clientId: beta.id,
      contractId: betaContract.id,
      routeId: null,
      pickupSiteId: null,
      dropoffSiteId: null,
      fromZoneId: zoneCairo.id,
      toZoneId: zoneSuez.id,
      vehicleClassId: vcHalfTruck.id,
      cargoTypeId: ctGeneral.id,
      tripType: "TRANSFER",
      basePrice: 4800,
      pricePerKm: 12,
      pricePerTon: 70,
      priority: 100,
      notes: "DEMO-BETA-ZONE-FALLBACK",
    }),
  ]);

  const [
    vehicle1,
    vehicle2,
    vehicle3,
  ] = await Promise.all([
    ensureVehicle({
      companyId,
      fleetNo: "FLT-100",
      plateNo: "س ط 1234",
      model: "Mercedes Actros",
      year: 2022,
    }),
    ensureVehicle({
      companyId,
      fleetNo: "FLT-200",
      plateNo: "س ط 5678",
      model: "Volvo FH",
      year: 2021,
    }),
    ensureVehicle({
      companyId,
      fleetNo: "FLT-300",
      plateNo: "س ط 9012",
      model: "MAN TGX",
      year: 2020,
    }),
  ]);

  const [
    driver1,
    driver2,
    driver3,
  ] = await Promise.all([
    ensureDriver({
      companyId,
      employeeCode: "DRV-001",
      fullName: "أحمد علي",
      phone: "01010000001",
      licenseNo: "LIC-DRV-001",
    }),
    ensureDriver({
      companyId,
      employeeCode: "DRV-002",
      fullName: "محمد حسن",
      phone: "01010000002",
      licenseNo: "LIC-DRV-002",
    }),
    ensureDriver({
      companyId,
      employeeCode: "DRV-003",
      fullName: "محمود سمير",
      phone: "01010000003",
      licenseNo: "LIC-DRV-003",
    }),
  ]);

  const trip1 = await ensureTrip({
    companyId,
    tripCode: "TRP-2026-0001",
    clientId: acme.id,
    siteId: acmeCairo.id,
    contractId: acmeContract.id,
    createdBy: actorUserId,
    supervisorId: actorUserId,
    scheduledAt: new Date("2026-03-01T08:00:00.000Z"),
    tripType: "DELIVERY",
    cargoType: "CONTAINER",
    cargoWeight: 18,
    origin: "مخزن القاهرة - ACME",
    destination: "ميناء الإسكندرية - ACME",
    agreedRevenue: 12500,
    status: "COMPLETED",
    financialStatus: "CLOSED",
    revenueEntryMode: "CONTRACT",
    closed: true,
  });

  const trip2 = await ensureTrip({
    companyId,
    tripCode: "TRP-2026-0002",
    clientId: acme.id,
    siteId: acmeAlex.id,
    contractId: acmeContract.id,
    createdBy: actorUserId,
    supervisorId: actorUserId,
    scheduledAt: new Date("2026-03-05T08:00:00.000Z"),
    tripType: "RETURN",
    cargoType: "GENERAL",
    cargoWeight: 12,
    origin: "ميناء الإسكندرية - ACME",
    destination: "مخزن القاهرة - ACME",
    agreedRevenue: 9800,
    status: "COMPLETED",
    financialStatus: "UNDER_REVIEW",
    revenueEntryMode: "CONTRACT",
    closed: false,
  });

  const trip3 = await ensureTrip({
    companyId,
    tripCode: "TRP-2026-0003",
    clientId: beta.id,
    siteId: beta10th.id,
    contractId: betaContract.id,
    createdBy: actorUserId,
    supervisorId: actorUserId,
    scheduledAt: new Date("2026-03-10T07:00:00.000Z"),
    tripType: "DELIVERY",
    cargoType: "BULK",
    cargoWeight: 20,
    origin: "مخزن العاشر - BETA",
    destination: "ميناء السخنة - BETA",
    agreedRevenue: 11200,
    status: "IN_PROGRESS",
    financialStatus: "OPEN",
    revenueEntryMode: "CONTRACT",
    closed: false,
  });

  const trip4 = await ensureTrip({
    companyId,
    tripCode: "TRP-2026-0004",
    clientId: beta.id,
    siteId: betaSokhna.id,
    contractId: betaContract.id,
    createdBy: actorUserId,
    supervisorId: actorUserId,
    scheduledAt: new Date("2026-03-12T09:00:00.000Z"),
    tripType: "TRANSFER",
    cargoType: "GENERAL",
    cargoWeight: 8,
    origin: "ميناء السخنة - BETA",
    destination: "مخزن العاشر - BETA",
    agreedRevenue: 7600,
    status: "ASSIGNED",
    financialStatus: "OPEN",
    revenueEntryMode: "CONTRACT",
    closed: false,
  });

  const trip5 = await ensureTrip({
    companyId,
    tripCode: "TRP-2026-0005",
    clientId: beta.id,
    siteId: beta10th.id,
    contractId: betaContract.id,
    createdBy: actorUserId,
    supervisorId: actorUserId,
    scheduledAt: new Date("2026-03-15T07:30:00.000Z"),
    tripType: "DELIVERY",
    cargoType: "BULK",
    cargoWeight: 22,
    origin: "مخزن العاشر - BETA",
    destination: "ميناء السخنة - BETA",
    agreedRevenue: 11800,
    status: "COMPLETED",
    financialStatus: "CLOSED",
    revenueEntryMode: "CONTRACT",
    closed: true,
  });

  const trip6 = await ensureTrip({
    companyId,
    tripCode: "TRP-2026-0006",
    clientId: acme.id,
    siteId: acmeCairo.id,
    contractId: acmeContract.id,
    createdBy: actorUserId,
    supervisorId: actorUserId,
    scheduledAt: new Date("2026-03-18T10:00:00.000Z"),
    tripType: "DELIVERY",
    cargoType: "CONTAINER",
    cargoWeight: 16,
    origin: "مخزن القاهرة - ACME",
    destination: "ميناء الإسكندرية - ACME",
    agreedRevenue: 12100,
    status: "APPROVED",
    financialStatus: "OPEN",
    revenueEntryMode: "CONTRACT",
    closed: false,
  });

  await Promise.all([
    ensureTripAssignment({
      companyId,
      tripId: trip1.id,
      vehicleId: vehicle1.id,
      driverId: driver1.id,
      fieldSupervisorId: actorUserId,
      active: true,
    }),
    ensureTripAssignment({
      companyId,
      tripId: trip2.id,
      vehicleId: vehicle2.id,
      driverId: driver2.id,
      fieldSupervisorId: actorUserId,
      active: true,
    }),
    ensureTripAssignment({
      companyId,
      tripId: trip3.id,
      vehicleId: vehicle3.id,
      driverId: driver3.id,
      fieldSupervisorId: actorUserId,
      active: true,
    }),
    ensureTripAssignment({
      companyId,
      tripId: trip4.id,
      vehicleId: vehicle1.id,
      driverId: driver1.id,
      fieldSupervisorId: actorUserId,
      active: true,
    }),
    ensureTripAssignment({
      companyId,
      tripId: trip5.id,
      vehicleId: vehicle2.id,
      driverId: driver2.id,
      fieldSupervisorId: actorUserId,
      active: true,
    }),
  ]);

  await Promise.all([
    ensureTripEvent({
      companyId,
      tripId: trip1.id,
      action: "CREATE",
      fromStatus: null,
      toStatus: "COMPLETED",
      actorId: actorUserId,
      notes: "Seeded completed trip",
    }),
    ensureTripEvent({
      companyId,
      tripId: trip2.id,
      action: "CREATE",
      fromStatus: null,
      toStatus: "COMPLETED",
      actorId: actorUserId,
      notes: "Seeded completed review-pending trip",
    }),
    ensureTripEvent({
      companyId,
      tripId: trip3.id,
      action: "START",
      fromStatus: "ASSIGNED",
      toStatus: "IN_PROGRESS",
      actorId: actorUserId,
      notes: "Seeded active trip",
    }),
    ensureTripEvent({
      companyId,
      tripId: trip4.id,
      action: "ASSIGN",
      fromStatus: "APPROVED",
      toStatus: "ASSIGNED",
      actorId: actorUserId,
      notes: "Seeded assigned trip",
    }),
    ensureTripEvent({
      companyId,
      tripId: trip5.id,
      action: "CREATE",
      fromStatus: null,
      toStatus: "COMPLETED",
      actorId: actorUserId,
      notes: "Seeded closed completed trip",
    }),
  ]);

  const revenue1 = await ensureTripRevenue({
    companyId,
    tripId: trip1.id,
    clientId: acme.id,
    contractId: acmeContract.id,
    amount: 12500,
    enteredBy: actorUserId,
    approvedBy: actorUserId,
    notes: "Seeded revenue for trip 1",
  });

  const revenue2 = await ensureTripRevenue({
    companyId,
    tripId: trip2.id,
    clientId: acme.id,
    contractId: acmeContract.id,
    amount: 9800,
    enteredBy: actorUserId,
    approvedBy: actorUserId,
    notes: "Seeded revenue for trip 2",
  });

  const revenue5 = await ensureTripRevenue({
    companyId,
    tripId: trip5.id,
    clientId: beta.id,
    contractId: betaContract.id,
    amount: 11800,
    enteredBy: actorUserId,
    approvedBy: actorUserId,
    notes: "Seeded revenue for trip 5",
  });

  const invoice1 = await ensureInvoice({
    companyId,
    clientId: acme.id,
    contractId: acmeContract.id,
    invoiceNo: "INV-2026-ACME-001",
    issueDate: new Date("2026-03-20T00:00:00.000Z"),
    dueDate: new Date("2026-04-03T00:00:00.000Z"),
    amount: 22300,
    vatAmount: 3122,
    status: "PARTIALLY_PAID",
    createdBy: actorUserId,
  });

  const invoice2 = await ensureInvoice({
    companyId,
    clientId: beta.id,
    contractId: betaContract.id,
    invoiceNo: "INV-2026-BETA-001",
    issueDate: new Date("2026-03-22T00:00:00.000Z"),
    dueDate: new Date("2026-04-05T00:00:00.000Z"),
    amount: 11800,
    vatAmount: 1652,
    status: "PAID",
    createdBy: actorUserId,
  });

  await Promise.all([
    ensureInvoiceTripLine({
      companyId,
      invoiceId: invoice1.id,
      tripId: trip1.id,
      amount: revenue1.amount,
    }),
    ensureInvoiceTripLine({
      companyId,
      invoiceId: invoice1.id,
      tripId: trip2.id,
      amount: revenue2.amount,
    }),
    ensureInvoiceTripLine({
      companyId,
      invoiceId: invoice2.id,
      tripId: trip5.id,
      amount: revenue5.amount,
    }),
  ]);

  const payment1 = await ensurePayment({
    companyId,
    clientId: acme.id,
    amount: 15000,
    paymentDate: new Date("2026-03-28T00:00:00.000Z"),
    reference: "PAY-ACME-001",
    createdBy: actorUserId,
    status: "POSTED",
  });

  const payment2 = await ensurePayment({
    companyId,
    clientId: beta.id,
    amount: 13452,
    paymentDate: new Date("2026-03-29T00:00:00.000Z"),
    reference: "PAY-BETA-001",
    createdBy: actorUserId,
    status: "POSTED",
  });

  await Promise.all([
    ensureAllocation({
      companyId,
      paymentId: payment1.id,
      invoiceId: invoice1.id,
      amountAllocated: 15000,
    }),
    ensureAllocation({
      companyId,
      paymentId: payment2.id,
      invoiceId: invoice2.id,
      amountAllocated: 13452,
    }),
  ]);

  const advance1 = await ensureCashAdvance({
    companyId,
    fieldSupervisorId: actorUserId,
    issuedBy: actorUserId,
    referenceNo: "ADV-2026-001",
    amount: 5000,
    status: "OPEN",
  });

  const advance2 = await ensureCashAdvance({
    companyId,
    fieldSupervisorId: actorUserId,
    issuedBy: actorUserId,
    referenceNo: "ADV-2026-002",
    amount: 3500,
    status: "SETTLED",
  });

  await Promise.all([
    ensureCashExpense({
      companyId,
      cashAdvanceId: advance1.id,
      tripId: trip3.id,
      vehicleId: vehicle3.id,
      createdBy: actorUserId,
      amount: 1800,
      expenseType: "FUEL",
      approvalStatus: "PENDING",
      notes: "Seeded fuel expense for active trip",
    }),
    ensureCashExpense({
      companyId,
      cashAdvanceId: advance2.id,
      tripId: trip5.id,
      vehicleId: vehicle2.id,
      createdBy: actorUserId,
      amount: 950,
      expenseType: "TOLL",
      approvalStatus: "APPROVED",
      notes: "Seeded toll expense for completed trip",
    }),
    ensureCashExpense({
      companyId,
      cashAdvanceId: null,
      tripId: null,
      vehicleId: vehicle1.id,
      createdBy: actorUserId,
      amount: 2200,
      expenseType: "MAINTENANCE",
      approvalStatus: "PENDING",
      notes: "Seeded pending general maintenance expense",
    }),
  ]);

  console.log("Seeded clients, sites, contracts, master data, routes, pricing rules.");
  console.log("Seeded vehicles, drivers, trips, assignments, events, revenues.");
  console.log("Seeded AR invoices, payments, allocations, cash advances, and expenses.");
  console.log("=== SEED LOGISTICS DEMO E2E END ===");
}

main()
  .catch((error) => {
    console.error("SEED LOGISTICS DEMO E2E FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });