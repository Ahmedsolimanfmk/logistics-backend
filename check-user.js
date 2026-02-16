const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false, // خليه يعتمد على sslmode في DATABASE_URL
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const u = await prisma.users.findFirst({
      where: { email: { equals: "ahmedhsmsa@gmail.com", mode: "insensitive" } },
    });

    console.log("FOUND?", !!u);
    console.log(u);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
