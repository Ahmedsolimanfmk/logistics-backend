require("dotenv").config();

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = "Admin@12345";

const usersSeed = [
  {
    employee_code: "EMP-0001",
    full_name: "System Admin",
    phone: "201000000001",
    email: "admin@logistics.local",
    role: "ADMIN",
  },
  {
    employee_code: "EMP-0002",
    full_name: "Field Supervisor One",
    phone: "201000000002",
    email: "field.supervisor1@logistics.local",
    role: "FIELD_SUPERVISOR",
  },
  {
    employee_code: "EMP-0003",
    full_name: "Field Supervisor Two",
    phone: "201000000003",
    email: "field.supervisor2@logistics.local",
    role: "FIELD_SUPERVISOR",
  },
  {
    employee_code: "EMP-0004",
    full_name: "General Supervisor",
    phone: "201000000004",
    email: "general.supervisor@logistics.local",
    role: "GENERAL_SUPERVISOR",
  },
  {
    employee_code: "EMP-0005",
    full_name: "Department Manager",
    phone: "201000000005",
    email: "dept.manager@logistics.local",
    role: "DEPT_MANAGER",
  },
  {
    employee_code: "EMP-0006",
    full_name: "General Manager",
    phone: "201000000006",
    email: "general.manager@logistics.local",
    role: "GENERAL_MANAGER",
  },
  {
    employee_code: "EMP-0007",
    full_name: "General Responsible",
    phone: "201000000007",
    email: "general.responsible@logistics.local",
    role: "GENERAL_RESPONSIBLE",
  },
  {
    employee_code: "EMP-0008",
    full_name: "Contract Manager",
    phone: "201000000008",
    email: "contract.manager@logistics.local",
    role: "CONTRACT_MANAGER",
  },
  {
    employee_code: "EMP-0009",
    full_name: "Store Keeper One",
    phone: "201000000009",
    email: "storekeeper1@logistics.local",
    role: "STOREKEEPER",
  },
  {
    employee_code: "EMP-0010",
    full_name: "Store Keeper Two",
    phone: "201000000010",
    email: "storekeeper2@logistics.local",
    role: "STOREKEEPER",
  },
  {
    employee_code: "EMP-0011",
    full_name: "HR Officer",
    phone: "201000000011",
    email: "hr@logistics.local",
    role: "HR",
  },
  {
    employee_code: "EMP-0012",
    full_name: "Accountant One",
    phone: "201000000012",
    email: "accountant1@logistics.local",
    role: "ACCOUNTANT",
  },
  {
    employee_code: "EMP-0013",
    full_name: "Accountant Two",
    phone: "201000000013",
    email: "accountant2@logistics.local",
    role: "ACCOUNTANT",
  },
  {
    employee_code: "EMP-0014",
    full_name: "Dispatcher",
    phone: "201000000014",
    email: "dispatcher@logistics.local",
    role: "DISPATCHER",
  },
  {
    employee_code: "EMP-0015",
    full_name: "Operations Officer",
    phone: "201000000015",
    email: "operations@logistics.local",
    role: "OPERATIONS",
  },
  {
    employee_code: "EMP-0016",
    full_name: "Maintenance Manager",
    phone: "201000000016",
    email: "maintenance.manager@logistics.local",
    role: "MAINTENANCE_MANAGER",
  },
];

async function main() {
  console.log("=== USERS SEED START ===");

  const password_hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  let created = 0;
  let updated = 0;

  for (const user of usersSeed) {
    const existing = await prisma.users.findFirst({
      where: {
        OR: [
          { email: user.email },
          { employee_code: user.employee_code },
          { phone: user.phone },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.users.update({
        where: { id: existing.id },
        data: {
          employee_code: user.employee_code,
          full_name: user.full_name,
          phone: user.phone,
          email: user.email,
          role: user.role,
          is_active: true,
        },
      });
      updated++;
    } else {
      await prisma.users.create({
        data: {
          employee_code: user.employee_code,
          full_name: user.full_name,
          phone: user.phone,
          email: user.email,
          password_hash,
          role: user.role,
          is_active: true,
        },
      });
      created++;
    }
  }

  console.log("Created users:", created);
  console.log("Updated users:", updated);
  console.log("Default password for seeded users:", DEFAULT_PASSWORD);
  console.log("=== USERS SEED END ===");
}

main()
  .catch((e) => {
    console.error("USERS SEED FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });