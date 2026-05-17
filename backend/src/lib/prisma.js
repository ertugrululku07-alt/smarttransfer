const { PrismaClient } = require('@prisma/client');

// Singleton Prisma client to prevent connection pool exhaustion in production
const prisma = new PrismaClient({
    log: ['error', 'warn'],
    errorFormat: 'minimal',
});

module.exports = prisma;
