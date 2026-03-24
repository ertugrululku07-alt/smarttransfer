const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

async function main() {
    const driver = await prisma.user.findFirst({
        where: { role: { code: 'DRIVER' } }
    });

    if (!driver) {
        console.log("no driver");
        return;
    }

    const token = jwt.sign({
        userId: driver.id,
        tenantId: driver.tenantId,
        email: driver.email
    }, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-me-in-production', { expiresIn: '7d' });

    console.log("Testing /driver/contact...");
    let res = await fetch('http://localhost:4000/api/driver/contact', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Contact Status:', res.status, await res.text());

    console.log("Testing /driver/dashboard...");
    res = await fetch('http://localhost:4000/api/driver/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Dashboard Status:', res.status);

    console.log("Testing /driver/bookings...");
    res = await fetch('http://localhost:4000/api/driver/bookings?type=all', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Bookings Status:', res.status);
}
main();
