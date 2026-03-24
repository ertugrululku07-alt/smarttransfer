const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

async function main() {
    const driver = await prisma.user.findFirst({
        where: { role: { code: 'DRIVER' } }
    });

    const token = jwt.sign({
        userId: driver.id,
        tenantId: driver.tenantId,
        email: driver.email
    }, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-me-in-production', { expiresIn: '7d' });

    console.log("TOKEN:", token);

    const res = await fetch('http://localhost:4000/api/driver/contact', {
        headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Response:', text);
}
main();
