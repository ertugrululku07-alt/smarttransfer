const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

console.log(
    prisma._dmmf.datamodel.models
        .find(m => m.name === 'Booking')
        .fields.map(f => f.name)
);
