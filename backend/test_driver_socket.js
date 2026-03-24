const io = require('socket.io-client');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const SOCKET_URL = 'http://localhost:4000';

async function main() {
    // 1. Get a driver token
    const driver = await prisma.user.findFirst({
        where: { role: { code: 'DRIVER' } }
    });

    if (!driver) {
        console.log("No driver found!");
        process.exit(1);
    }

    const token = jwt.sign({
        userId: driver.id,
        tenantId: driver.tenantId,
        email: driver.email
    }, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-me-in-production', { expiresIn: '7d' });

    console.log(`Connecting as driver: ${driver.fullName} (${driver.id})`);

    // 2. Connect socket
    const socket = io(SOCKET_URL, {
        transports: ['websocket']
    });

    socket.on('connect', () => {
        console.log('Socket connected! Authenticating...');
        socket.emit('authenticate', token);
    });

    socket.on('authenticated', (data) => {
        console.log('Successfully authenticated as:', data.user.name);
        console.log('Waiting for messages... Please send a message from the Admin Panel to this driver.');
    });

    socket.on('new_message', (msg) => {
        console.log('--- NEW MESSAGE RECEIVED IN SOCKET ---');
        console.log(JSON.stringify(msg, null, 2));
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
    });

    socket.on('error', (err) => {
        console.error('Socket error:', err);
    });

    // Keep running for 30 seconds
    setTimeout(() => {
        console.log('Test completed.');
        process.exit(0);
    }, 60000);
}

main().catch(console.error);
