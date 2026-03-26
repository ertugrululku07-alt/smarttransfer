const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    const tenant = await prisma.tenant.findFirst();
    console.log('Tenant ID:', tenant?.id);
    console.log('Settings JSON:', JSON.stringify(tenant?.settings, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
check();
