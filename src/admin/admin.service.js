const prisma = require("../prisma");

// =====================
// GET COMPANIES
// =====================
exports.getCompanies = async () => {
  const companies = await prisma.companies.findMany({
    select: {
      id: true,
      name: true,
      is_active: true,
      created_at: true,
    },
    orderBy: {
      created_at: "desc",
    },
  });

  return {
    total: companies.length,
    items: companies,
  };
};

// =====================
// TOGGLE COMPANY
// =====================
exports.toggleCompany = async (companyId) => {
  const company = await prisma.companies.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new Error("Company not found");
  }

  const updated = await prisma.companies.update({
    where: { id: companyId },
    data: {
      is_active: !company.is_active,
    },
  });

  return updated;
};

// =====================
// COMPANY STATS
// =====================
exports.getCompanyStats = async (companyId) => {
  const [
    tripsCount,
    driversCount,
    vehiclesCount,
    revenue,
  ] = await Promise.all([
    prisma.trips.count({
      where: { company_id: companyId },
    }),

    prisma.drivers.count({
      where: { company_id: companyId },
    }),

    prisma.vehicles.count({
      where: { company_id: companyId },
    }),

    prisma.trip_revenues.aggregate({
      where: {
        company_id: companyId,
        status: "APPROVED",
      },
      _sum: {
        amount: true,
      },
    }),
  ]);

  return {
    trips: tripsCount,
    drivers: driversCount,
    vehicles: vehiclesCount,
    revenue: Number(revenue._sum.amount || 0),
  };
};