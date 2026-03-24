const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const API_URL = 'http://localhost:4000/api';

async function main() {
    // 1. Get an Admin token
    let admin = await prisma.user.findFirst({
        where: { email: 'muratoner@hotmail.com' } // Valid admin email
    });

    // If specific email not found, try to find any tenant admin
    if (!admin) {
        admin = await prisma.user.findFirst({
            where: { role: { code: 'ADMIN' } }
        });
    }

    // 2. Get the Driver ID
    const driver = await prisma.user.findFirst({
        where: { role: { code: 'DRIVER' } }
    });

    if (!admin || !driver) {
        console.log("Missing admin or driver!");
        process.exit(1);
    }

    const token = jwt.sign({
        userId: admin.id,
        tenantId: admin.tenantId,
        email: admin.email
    }, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-me-in-production', { expiresIn: '7d' });

    console.log(`Sending message from ${admin.fullName} to ${driver.fullName}...`);

    const res = await fetch(`${API_URL}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            receiverId: driver.id,
            content: "Hello from the test script! " + new Date().getTime()
        })
    });

    const json = await res.json();
    console.log("Send result:", json);
}

main().catch(console.error);
