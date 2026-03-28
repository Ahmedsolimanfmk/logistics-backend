require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

function mapLegacyRoleToCompanyRole(user) {
  switch (user.role) {
    case "ACCOUNTANT":
      return "ACCOUNTANT";
    case "FIELD_SUPERVISOR":
      return "FIELD_SUPERVISOR";
    case "GENERAL_SUPERVISOR":
      return "GENERAL_SUPERVISOR";
    case "DEPT_MANAGER":
      return "DEPT_MANAGER";
    case "GENERAL_MANAGER":
      return "GENERAL_MANAGER";
    case "GENERAL_RESPONSIBLE":
      return "GENERAL_RESPONSIBLE";
    case "CONTRACT_MANAGER":
      return "CONTRACT_MANAGER";
    case "STOREKEEPER":
      return "STOREKEEPER";
    case "HR":
      return "HR";
    case "DISPATCHER":
      return "DISPATCHER";
    case "OPERATIONS":
      return "OPERATIONS";
    case "MAINTENANCE_MANAGER":
      return "MAINTENANCE_MANAGER";
    case "ADMIN":
    default:
      return "ADMIN";
  }
}

async function main() {
  const company = await prisma.companies.findUnique({
    where: { code: "COMP-DEFAULT" },
    select: { id: true, code: true },
  });

  if (!company) {
    throw new Error("Default company not found. Run seed-default-company first.");
  }

  const users = await prisma.users.findMany({
    select: {
      id: true,
      role: true,
      full_name: true,
      email: true,
    },
  });

  let created = 0;
  let updated = 0;

  for (const user of users) {
    const companyRole = mapLegacyRoleToCompanyRole(user);

    const existing = await prisma.company_users.findUnique({
      where: {
        company_id_user_id: {
          company_id: company.id,
          user_id: user.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.company_users.update({
        where: { id: existing.id },
        data: {
          company_role: companyRole,
          status: "ACTIVE",
          is_active: true,
          left_at: null,
        },
      });
      updated += 1;
    } else {
      await prisma.company_users.create({
        data: {
          company_id: company.id,
          user_id: user.id,
          company_role: companyRole,
          status: "ACTIVE",
          is_active: true,
        },
      });
      created += 1;
    }
  }

  console.log(`Memberships created: ${created}`);
  console.log(`Memberships updated: ${updated}`);
  console.log(`Users processed: ${users.length}`);
}

main()
  .catch((error) => {
    console.error("BACKFILL USER MEMBERSHIPS FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });