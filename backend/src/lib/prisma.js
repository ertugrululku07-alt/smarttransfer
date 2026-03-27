const { PrismaClient } = require('@prisma/client');

// Singleton Prisma client to prevent connection pool exhaustion on Railway
const prisma = new PrismaClient({
    log: ['error', 'warn'],
    errorFormat: 'minimal',
});

module.exports = prisma;
