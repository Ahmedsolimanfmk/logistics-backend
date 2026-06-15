const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Attempting to unlock advisory locks...');
  try {
    const res = await prisma.$executeRaw`SELECT pg_advisory_unlock_all();`;
    console.log('Unlock result:', res);
  } catch (e) {
    console.error('Error unlocking:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
