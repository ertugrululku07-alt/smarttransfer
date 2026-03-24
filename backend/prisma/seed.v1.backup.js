// backend/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seed başlıyor...');

  // Admin
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: { passwordHash: 'admin123' }, // Şifreyi her zaman güncelle
    create: {
      name: 'Admin User',
      email: 'admin@example.com',
      passwordHash: 'admin123', // Şimdilik plain text, sonra hash'e çeviririz
      role: 'ADMIN',
    },
  });

  // Driver
  await prisma.user.upsert({
    where: { email: 'driver@example.com' },
    update: { passwordHash: 'driver123' },
    create: {
      name: 'Ahmet Yılmaz',
      email: 'driver@example.com',
      passwordHash: 'driver123',
      role: 'DRIVER',
    },
  });

  // Customer
  await prisma.user.upsert({
    where: { email: 'customer@example.com' },
    update: { passwordHash: 'customer123' },
    create: {
      name: 'Ayşe Demir',
      email: 'customer@example.com',
      passwordHash: 'customer123',
      role: 'CUSTOMER',
    },
  });

  console.log('Seed tamamlandı.');
}

main()
  .catch((e) => {
    console.error('Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });