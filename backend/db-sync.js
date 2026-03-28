const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- DATABASE SYNC START ---');
  try {
    // 1. Add pickupLocation if not exists
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ShuttleRoute' AND column_name='pickupLocation') THEN
          ALTER TABLE "ShuttleRoute" ADD COLUMN "pickupLocation" TEXT;
          RAISE NOTICE 'Added column pickupLocation to ShuttleRoute';
        END IF;
      END $$;
    `);

    // 2. Add pickupRadius if not exists
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ShuttleRoute' AND column_name='pickupRadius') THEN
          ALTER TABLE "ShuttleRoute" ADD COLUMN "pickupRadius" DOUBLE PRECISION;
          RAISE NOTICE 'Added column pickupRadius to ShuttleRoute';
        END IF;
      END $$;
    `);

    // 3. Add pickupPolygon if not exists
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ShuttleRoute' AND column_name='pickupPolygon') THEN
          ALTER TABLE "ShuttleRoute" ADD COLUMN "pickupPolygon" JSONB;
          RAISE NOTICE 'Added column pickupPolygon to ShuttleRoute';
        END IF;
      END $$;
    `);

    console.log('--- DATABASE SYNC SUCCESS ---');
  } catch (error) {
    console.error('--- DATABASE SYNC FAILED ---', error);
    // Continue anyway to avoid blocking the start
  } finally {
    await prisma.$disconnect();
  }
}

main();
