// backend/index.js
// SmartTravel Platform - Main Server
// Version: 2.0.0 Enterprise

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Middleware
const tenantMiddleware = require('./src/middleware/tenant');

// Routes
const authRoutes = require('./src/routes/auth');
const tenantRoutes = require('./src/routes/tenant');
const dashboardRoutes = require('./src/routes/dashboard');
const transferRoutes = require('./src/routes/transfer');

const app = express();
const PORT = process.env.PORT || 4000;

// Global error tracking for production debugging
let lastServerError = { 
  timestamp: null, 
  message: "No error recorded since last start", 
  stack: null, 
  path: null, 
  method: null 
};

// ============================================================================
// MIDDLEWARE SETUP
// ============================================================================

// CORS - Allow frontend and mobile apps
app.use(cors({
  origin: true, // Allow all origins (frontend + mobile app)
  credentials: true
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (MOVED TO TOP for v2.3.4)
const uploadsPath = path.resolve(__dirname, 'public/uploads');

// Ensure public/uploads exists
if (!fs.existsSync(path.resolve(__dirname, 'public'))) {
  fs.mkdirSync(path.resolve(__dirname, 'public'));
}
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath);
}

app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, path) => {
    if (path.toLowerCase().endsWith('.jfif')) {
      res.setHeader('Content-Type', 'image/jpeg');
    }
  }
}));

// Request logging (development)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Audit logging (records all mutations to the DB)
const { auditLogMiddleware } = require('./src/middleware/audit');
app.use(auditLogMiddleware);

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.1.0',
    timestamp: new Date().toISOString()
  });
});

// Removed duplicate ping for v2.3.2 diagnostics

app.get('/api/debug/error-log', (req, res) => {
  res.json({
    success: true,
    lastError: lastServerError
  });
});

// ============================================================================
// ROUTES (with Tenant Middleware)
// ============================================================================

// Public routes (no tenant needed, but tenant is resolved if available)
app.use('/api/auth', tenantMiddleware, authRoutes);

// Tenant-specific routes
app.use('/api/tenant', tenantMiddleware, tenantRoutes);

// Dashboard routes (require authentication)
app.use('/api/dashboard', tenantMiddleware, dashboardRoutes);

// Transfer module routes
// Transfer module routes
app.use('/api/transfer', tenantMiddleware, transferRoutes);

// Vehicle routes
const vehicleRoutes = require('./src/routes/vehicles');
app.use('/api/vehicles', tenantMiddleware, vehicleRoutes);

// Vehicle Type routes
const vehicleTypeRoutes = require('./src/routes/vehicle-types');
app.use('/api/vehicle-types', tenantMiddleware, vehicleTypeRoutes);

// Vehicle Tracking routes
const vehicleTrackingRoutes = require('./src/routes/vehicle-tracking');
app.use('/api/vehicle-tracking', tenantMiddleware, vehicleTrackingRoutes);

// Extra Services routes
const extraServiceRoutes = require('./src/routes/extra-services');
app.use('/api/extra-services', tenantMiddleware, extraServiceRoutes);


// Static serving removed here, moved to top in v2.3.4

app.get('/api/ping', (req, res) => {
  let fileList = [];
  try {
     fileList = fs.readdirSync(uploadsPath);
  } catch (e) {
     fileList = ["Error reading dir: " + e.message];
  }
  
  res.json({
    success: true,
    message: 'SmartTravel API is running!',
    version: '2.3.4',
    env: {
      cwd: process.cwd(),
      dirname: __dirname,
      uploadsPath: uploadsPath,
      files: fileList.slice(-10) // Show last 10 files
    }
  });
});

// Upload route
const uploadRoutes = require('./src/routes/upload');
app.use('/api/upload', tenantMiddleware, uploadRoutes);

// Admin routes
const adminRoutes = require('./src/routes/admin');
app.use('/api/admin', tenantMiddleware, adminRoutes);

// Admin Agency routes
const adminAgencyRoutes = require('./src/routes/admin-agencies');
app.use('/api/admin/agencies', tenantMiddleware, adminAgencyRoutes);

// Agency (B2B) operations
const agencyRoutes = require('./src/routes/agency');
app.use('/api/agency', tenantMiddleware, agencyRoutes);

// Shuttle routes
const shuttleRoutes = require('./src/routes/shuttle-routes');
app.use('/api/shuttle-routes', tenantMiddleware, shuttleRoutes);

// Personnel routes
const personnelRoutes = require('./src/routes/personnel');
app.use('/api/personnel', tenantMiddleware, personnelRoutes);

// Flight routes
const flightRoutes = require('./src/routes/flight');
app.use('/api/flight', tenantMiddleware, flightRoutes);

// Accounting routes
const accountingRoutes = require('./src/routes/accounting');
app.use('/api/accounting', tenantMiddleware, accountingRoutes);

// Invoice routes (Sales & Purchase - e-Fatura)
const invoiceRoutes = require('./src/routes/invoices');
app.use('/api/invoices', tenantMiddleware, invoiceRoutes);

// Payment routes
const paymentRoutes = require('./src/routes/payment');
app.use('/api/payment', tenantMiddleware, paymentRoutes);

// Bank Management routes
const bankRoutes = require('./src/routes/banks');
app.use('/api/banks', tenantMiddleware, bankRoutes);

// Kasa (Cash Register) routes
const kasaRoutes = require('./src/routes/kasa');
app.use('/api/kasa', tenantMiddleware, kasaRoutes);

// Operations (Conflict Detection, Availability, AI Suggest)
const operationsRoutes = require('./src/routes/operations');
app.use('/api/operations', tenantMiddleware, operationsRoutes);

// Zones routes
const zonesRoutes = require('./src/routes/zones');
app.use('/api/zones', tenantMiddleware, zonesRoutes);

// Pages (CMS) routes
const pagesRoutes = require('./src/routes/pages');
app.use('/api/pages', tenantMiddleware, pagesRoutes);

// User management routes
const userRoutes = require('./src/routes/users');
app.use('/api/users', tenantMiddleware, userRoutes);

// Audit / Activity Logs route
app.use('/api/admin/logs', tenantMiddleware, require('./src/routes/logs'));

// Live Chat Webhook route (from n8n)
app.use('/api/live-chat', require('./src/routes/live-chat'));

// ============================================================================
// V1 LEGACY ROUTES (Backward Compatibility)
// ============================================================================
// These will be migrated gradually to new architecture

// Transfer search (mock data for now)
app.post('/api/transfers/search', tenantMiddleware, async (req, res) => {
  try {
    const { pickup, dropoff, pickupDateTime, passengers = 1, transferType } = req.body;

    if (!pickup || !dropoff || !pickupDateTime) {
      return res.status(400).json({
        success: false,
        error: 'pickup, dropoff ve pickupDateTime zorunludur.'
      });
    }

    // Mock pricing calculation
    const basePrice = 50;
    const passengerFactor = Math.max(1, passengers / 2);
    const roundTripFactor = transferType === 'ROUND_TRIP' ? 1.8 : 1;
    const calculatedPrice = basePrice * passengerFactor * roundTripFactor;

    // Mock results
    const results = [
      {
        id: 1,
        vehicleType: 'Sedan',
        vendor: 'SmartTransfer',
        price: calculatedPrice,
        capacity: 3,
        cancellationPolicy: '24 saat öncesine kadar ücretsiz iptal',
        features: ['Klimalı', 'WiFi', 'İngilizce konuşan şoför']
      },
      {
        id: 2,
        vehicleType: 'Van',
        vendor: 'SmartTransfer Premium',
        price: calculatedPrice + 20,
        capacity: 6,
        cancellationPolicy: '24 saat öncesine kadar ücretsiz iptal',
        features: ['Klimalı', 'WiFi', 'Geniş bagaj alanı', 'Çocuk koltuğu']
      }
    ];

    res.json({
      success: true,
      data: { pickup, dropoff, pickupDateTime, results }
    });

  } catch (error) {
    console.error('Transfer search error:', error);
    res.status(500).json({
      success: false,
      error: 'Transfer arama başarısız oldu'
    });
  }
});


// ============================================================================
// ADDITIONAL ROUTES (Driver App & Messaging)
// ============================================================================

const driverRoutes = require('./src/routes/driver');
const messageRoutes = require('./src/routes/messages');

app.use('/api/driver', driverRoutes);
app.use('/api/messages', messageRoutes);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// ============================================================================
// NEWS PROXY (RSS Feed - CORS safe)
// ============================================================================
app.get('/api/news/tourism', async (req, res) => {
  try {
    const axios = require('axios');
    const response = await axios.get('https://www.turizmguncel.com/rss/haber', {
      timeout: 8000,
      headers: { 'User-Agent': 'SmartTransfer/2.0 RSS Reader' }
    });
    const xml = response.data;

    // Simple XML parse: extract <item> blocks
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 15) {
      const block = match[1];
      const getTag = (tag) => {
        const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
        return m ? (m[1] || m[2] || '').trim() : '';
      };
      const getAttr = (tag, attr) => {
        const m = block.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`));
        return m ? m[1] : '';
      };
      const imgInDesc = (getTag('description') || '').match(/<img[^>]+src=["']([^"']+)["']/i);
      items.push({
        title: getTag('title'),
        link: getTag('link') || getTag('guid'),
        pubDate: getTag('pubDate'),
        description: (getTag('description') || '').replace(/<[^>]+>/g, '').slice(0, 140),
        imageUrl: getAttr('enclosure', 'url') || (imgInDesc ? imgInDesc[1] : null)
      });
    }

    res.json({ success: true, data: items });
  } catch (err) {
    console.error('RSS proxy error:', err.message);
    res.json({ success: false, data: [] });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Global Error Handler for Production Debugging
app.use((err, req, res, next) => {
  console.error('GLOBAL_ERROR_HANDLER_LOG:', err);
  
  lastServerError = {
    timestamp: new Date().toISOString(),
    message: err.message || 'Unknown error',
    stack: err.stack,
    path: req.path,
    method: req.method,
    query: req.query,
    body: (req.method === 'POST' || req.method === 'PATCH') ? req.body : undefined
  };

  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    diagnostic: err.message,
    stack: err.stack
  });
});

// ============================================================================
// START SERVER
// ============================================================================

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins for mobile app/web panel
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  // Generous timeouts for mobile clients (Android kills WebSocket in background)
  pingTimeout: 60000,   // Wait 60s for pong before considering connection dead (default 20s)
  pingInterval: 25000,  // Send ping every 25s (default 25s)
});

// Import socket handler
require('./src/socket/driverHandler')(io, app);
require('./src/socket/chatHandler')(io, app);

// Make io accessible to our router
global.io = io; // Added for webhook access
app.set('io', io);

// ── Raw WebSocket endpoint for native Android service ─────────────────────
// IMPORTANT: Use noServer mode to prevent conflicts with Socket.IO's upgrade handler.
// When ws is created with { server, path }, both ws and Socket.IO listen on the
// same HTTP upgrade event, causing "Invalid frame header" errors during
// Socket.IO's polling → websocket transport upgrade.
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./src/middleware/auth');

const wss = new WebSocketServer({ noServer: true });

// Manually route upgrade requests: /ws/driver → raw ws, everything else → Socket.IO
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;

  if (pathname === '/ws/driver') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
  // Socket.IO handles /socket.io/ upgrades via its own internal listener
});

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const fromQuery = url.searchParams.get('token');
  const fromHeader = req.headers['authorization']?.replace('Bearer ', '');
  const wsToken = fromQuery || fromHeader;

  if (!wsToken) { ws.close(4001, 'No token'); return; }

  let userId, userName;
  try {
    const decoded = jwt.verify(wsToken, JWT_SECRET);
    userId = decoded.userId;
    const prisma = require('./src/lib/prisma');
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true } });
    if (!user) { ws.close(4002, 'User not found'); return; }
    userName = user.fullName;
  } catch (e) { ws.close(4003, 'Invalid token'); return; }

  console.log(`[WS/driver] ${userName} connected`);
  ws.isAlive = true;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    try {
      const loc = JSON.parse(data);
      if (!loc.lat || !loc.lng) return;

      const onlineDrivers = app.get('onlineDrivers');
      if (onlineDrivers) {
        onlineDrivers[userId] = {
          ...onlineDrivers[userId],
          socketId: 'ws-native',
          lastSeen: Date.now(),
          location: { lat: loc.lat, lng: loc.lng, speed: loc.speed || 0, heading: loc.heading || 0 }
        };
      }

      io.to('admin_monitoring').emit('driver_location', {
        driverId: userId,
        driverName: userName,
        lat: loc.lat,
        lng: loc.lng,
        speed: loc.speed || 0,
        heading: loc.heading || 0,
        source: 'ws_native',
        timestamp: new Date()
      });
    } catch (e) { /* ignore parse errors */ }
  });

  ws.on('close', () => { console.log(`[WS/driver] ${userName} disconnected`); });
});

// Heartbeat: drop dead connections every 30s
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => {
  console.log('');
  console.log('� ========================================');
  console.log('🚀  SmartTravel Platform API');
  console.log('🚀 ========================================');
  console.log(`🚀  Version: 2.0.0 Enterprise`);
  console.log(`🚀  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🚀  Port: ${PORT}`);
  console.log(`🚀  URL: http://localhost:${PORT}`);
  console.log('🚀 ========================================');
  console.log('');
  console.log('�📚 Available endpoints:');
  console.log('   GET  /health');
  console.log('   GET  /api/ping');
  console.log('   POST /api/auth/login');
  console.log('   POST /api/auth/register');
  console.log('   POST /api/auth/refresh');
  console.log('   GET  /api/auth/me');
  console.log('   GET  /api/tenant/info');
  console.log('   GET  /api/tenant/modules');
  console.log('   GET  /api/tenant/theme');
  console.log('   WS   Socket.io enabled');
  console.log('');

  // ==========================================================================
  // INITIALIZE CRON JOBS
  // ==========================================================================
  require('./src/cron/salaryCron')();

  // Initialize Daily DB Cleanup (Runs at 03:00 AM every day)
  const cron = require('node-cron');
  const { runCleanup } = require('./db_cleanup');
  cron.schedule('0 3 * * *', () => {
    console.log('[Cron] Starting daily database maintenance...');
    runCleanup(30); // Keep last 30 days
  });
  console.log('⏰ Database cleanup job scheduled (Daily at 03:00 AM)');

  // ==========================================================================
  // 1-MINUTE SILENT PUSH JOB
  // Wakes up driver apps even when force-closed (like WhatsApp / tracking apps)
  // ==========================================================================
  const { Expo } = require('expo-server-sdk');
  const expo = new Expo({ useFcmV1: true });
  const prisma = require('./src/lib/prisma');

  const sendSilentPushToDrivers = async () => {
    try {
      // Find all drivers who have a push token
      const drivers = await prisma.user.findMany({
        where: {
          pushToken: { not: null },
          role: { type: { in: ['DRIVER', 'PARTNER', 'TENANT_STAFF'] } }
        },
        select: { id: true, fullName: true, pushToken: true }
      });

      if (drivers.length === 0) return;

      const messages = drivers
        .filter(d => d.pushToken && Expo.isExpoPushToken(d.pushToken))
        .map(d => ({
          to: d.pushToken,
          // Data-only push (no title or body). Android processes these purely in the background (Firebase Messaging Service)
          // without displaying a notification bubble.
          sound: null,
          priority: 'high',
          channelId: 'location-sync',
          data: { type: 'LOCATION_REQUEST', timestamp: Date.now() },
          _contentAvailable: true, // iOS silent push
        }));

      if (messages.length === 0) return;

      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          const receipts = await expo.sendPushNotificationsAsync(chunk);
          receipts.forEach((receipt, i) => {
            if (receipt.status === 'error') {
              console.warn(`[Push] Failed for ${messages[i].to?.substring(0, 20)}: ${receipt.message}`);
              // If token is invalid, clear it from DB
              if (receipt.details?.error === 'DeviceNotRegistered') {
                prisma.user.updateMany({
                  where: { pushToken: messages[i].to },
                  data: { pushToken: null }
                }).catch(() => { });
              }
            }
          });
          // Only log occasionally to avoid spam
          if (Math.random() < 0.1) {
            console.log(`[Push] Sent silent wake-up to ${messages.length} driver(s)`);
          }
        } catch (err) {
          console.error('[Push] Error sending chunk:', err.message);
        }
      }
    } catch (err) {
      console.error('[Push] Silent push job error:', err.message);
    }
  };

  // Run every 30 seconds - very aggressive to ensure near-instant recovery from airplane mode
  setInterval(sendSilentPushToDrivers, 30 * 1000);
  // Also run once immediately on startup
  setTimeout(sendSilentPushToDrivers, 5000);
  console.log('📡 Silent push job started (every 30 seconds)');
});

// Trigger restart for env load
// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});