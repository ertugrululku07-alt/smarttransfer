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

// AI Integration Routes (for n8n tools)
app.use('/api/ai', require('./src/routes/ai.js'));

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
const ratingsRoutes = require('./src/routes/ratings');

app.use('/api/driver', driverRoutes);
app.use('/api/messages', messageRoutes);
// Ratings: admin endpoints need tenantMiddleware (resolves req.tenant via header)
// Public endpoints do their own tenant resolution from JWT token, so middleware order is fine
app.use('/api/ratings', tenantMiddleware, ratingsRoutes);

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
    runCleanup(3); // Keep last 3 days instead of 30
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

  // ==========================================================================
  // FLIGHT TRACKING JOB — Notify drivers about flight delays / landings (every 5 min)
  // ==========================================================================
  // Helper: send a visible push notification to a driver
  const sendDriverPush = async (driver, title, body, data = {}) => {
    try {
      if (!driver?.pushToken || !Expo.isExpoPushToken(driver.pushToken)) return;
      const msg = {
        to: driver.pushToken,
        sound: 'default',
        priority: 'high',
        channelId: 'flight-alerts',
        title, body,
        data: { type: 'FLIGHT_ALERT', ...data },
      };
      const chunks = expo.chunkPushNotifications([msg]);
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk).catch(e => console.warn('[FlightPush] send err:', e.message));
      }
    } catch (e) {
      console.warn('[FlightPush] error:', e.message);
    }
  };

  const checkUpcomingFlights = async () => {
    try {
      const now = new Date();
      const horizonMs = 4 * 60 * 60 * 1000; // next 4 hours
      const startMax = new Date(now.getTime() + horizonMs);
      const startMin = new Date(now.getTime() - 30 * 60 * 1000); // include slightly past pickups (delayed flights)

      // Tenants with flight tracking enabled
      const tenants = await prisma.tenant.findMany({
        where: { settings: { path: ['flightTracking', 'enabled'], equals: true } },
        select: { id: true, settings: true }
      });
      if (!tenants.length) return;

      for (const t of tenants) {
        const apiKey = t.settings?.flightTracking?.apiKey;
        if (!apiKey) continue;

        // Bookings in window with flight number and assigned driver, not finished
        const bookings = await prisma.booking.findMany({
          where: {
            tenantId: t.id,
            status: { in: ['CONFIRMED', 'ASSIGNED'] },
            startDate: { gte: startMin, lte: startMax },
            driverId: { not: null },
            OR: [
              { flightNumber: { not: null } },
              { metadata: { path: ['flightNumber'], not: null } },
            ],
          },
          select: { id: true, flightNumber: true, metadata: true, startDate: true, driverId: true, contactName: true, pickup: true }
        });

        // Group by flight number to minimise API calls
        const byFlight = new Map();
        for (const b of bookings) {
          const fn = (b.flightNumber || b.metadata?.flightNumber || '').toUpperCase().replace(/\s+/g, '');
          if (!fn) continue;
          if (!byFlight.has(fn)) byFlight.set(fn, []);
          byFlight.get(fn).push(b);
        }

        for (const [flightIata, group] of byFlight) {
          // Cache: skip if last check < 8 minutes ago for this flight (across all bookings)
          const lastCheckedMs = Math.max(...group.map(b => {
            const ts = b.metadata?.flightLastCheckedAt;
            return ts ? new Date(ts).getTime() : 0;
          }));
          if (Date.now() - lastCheckedMs < 8 * 60 * 1000) continue;

          // Fetch from AviationStack
          let flightInfo = null;
          try {
            const url = `http://api.aviationstack.com/v1/flights?access_key=${encodeURIComponent(apiKey)}&flight_iata=${encodeURIComponent(flightIata)}&limit=3`;
            const fetchResp = await fetch(url);
            const json = await fetchResp.json();
            if (json?.data?.length) {
              // Pick the one nearest to today
              const today = new Date().toISOString().substring(0, 10);
              flightInfo = json.data.find(f => (f.flight_date || '').startsWith(today)) || json.data[0];
            }
          } catch (e) {
            console.warn('[FlightCheck] fetch err for', flightIata, e.message);
            continue;
          }
          if (!flightInfo) continue;

          const status = flightInfo.flight_status; // scheduled | active | landed | cancelled
          const arrSched = flightInfo.arrival?.scheduled ? new Date(flightInfo.arrival.scheduled) : null;
          const arrEst = flightInfo.arrival?.estimated ? new Date(flightInfo.arrival.estimated)
            : (flightInfo.arrival?.actual ? new Date(flightInfo.arrival.actual) : null);
          const arrActual = flightInfo.arrival?.actual ? new Date(flightInfo.arrival.actual) : null;
          const depSched = flightInfo.departure?.scheduled ? new Date(flightInfo.departure.scheduled) : null;
          const depEst = flightInfo.departure?.estimated ? new Date(flightInfo.departure.estimated)
            : (flightInfo.departure?.actual ? new Date(flightInfo.departure.actual) : null);
          const arrDelayMin = arrSched && arrEst ? Math.round((arrEst.getTime() - arrSched.getTime()) / 60000) : (flightInfo.arrival?.delay || 0);
          const depDelayMin = depSched && depEst ? Math.round((depEst.getTime() - depSched.getTime()) / 60000) : (flightInfo.departure?.delay || 0);

          for (const b of group) {
            const meta = b.metadata || {};
            const driver = await prisma.user.findUnique({ where: { id: b.driverId }, select: { id: true, fullName: true, pushToken: true } });
            if (!driver) continue;

            // Direction: ARV if dropoff is airport-related (heuristic based on iata or status)
            // Easiest: use metadata.transferDirection if set, else infer
            const direction = meta.transferDirection
              || meta.direction
              || (String(b.pickup || '').toLowerCase().includes('havaliman') || String(b.pickup || '').toLowerCase().includes('airport') ? 'ARV' : 'DEP');

            const updates = {
              flightLastCheckedAt: new Date().toISOString(),
              flightStatus: status,
              flightArrSched: arrSched?.toISOString() || null,
              flightArrEst: arrEst?.toISOString() || null,
              flightArrActual: arrActual?.toISOString() || null,
              flightArrDelayMin: arrDelayMin,
              flightDepDelayMin: depDelayMin,
            };

            // ── ARV: 10 minutes before landing notification ──
            if (direction === 'ARV' && arrEst) {
              const minsToLanding = (arrEst.getTime() - Date.now()) / 60000;
              if (minsToLanding > 0 && minsToLanding <= 12 && !meta.flightNotified10Min) {
                await sendDriverPush(
                  driver,
                  '✈️ Uçak 10 Dakikaya İniyor',
                  `${flightIata} - ${b.contactName || 'Müşteriniz'} | ~${Math.round(minsToLanding)} dk sonra inecek. Havalimanına yanaşmaya hazırlanın.`,
                  { bookingId: b.id, flightNumber: flightIata, kind: 'TEN_MIN_BEFORE' }
                );
                updates.flightNotified10Min = true;
              }
            }

            // ── ARV: Plane landed notification ──
            if (direction === 'ARV' && (status === 'landed' || arrActual) && !meta.flightNotifiedLanded) {
              await sendDriverPush(
                driver,
                '🛬 Uçak İndi',
                `${flightIata} - ${b.contactName || 'Müşteriniz'} indi. Buluşma noktasına gidin.`,
                { bookingId: b.id, flightNumber: flightIata, kind: 'LANDED' }
              );
              updates.flightNotifiedLanded = true;
            }

            // ── ARV delay: arrival is delayed ≥15 min and not yet notified for this delay tier ──
            if (direction === 'ARV' && arrDelayMin >= 15) {
              const lastNotifiedDelay = meta.flightArrDelayNotifiedMin || 0;
              if (arrDelayMin - lastNotifiedDelay >= 15) { // notify on every +15 min change
                await sendDriverPush(
                  driver,
                  '⏰ Uçak Rötarlı',
                  `${flightIata} - ${b.contactName || 'Müşteriniz'} | ${arrDelayMin} dk gecikme. Tahmini iniş: ${arrEst ? arrEst.toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-'}`,
                  { bookingId: b.id, flightNumber: flightIata, kind: 'ARV_DELAY', delayMin: arrDelayMin }
                );
                updates.flightArrDelayNotifiedMin = arrDelayMin;
              }
            }

            // ── DEP delay: customer's outbound flight delayed → driver should know to wait/postpone ──
            if (direction === 'DEP' && depDelayMin >= 15) {
              const lastNotifiedDelay = meta.flightDepDelayNotifiedMin || 0;
              if (depDelayMin - lastNotifiedDelay >= 15) {
                await sendDriverPush(
                  driver,
                  '⏰ Müşterinin Uçağı Rötarlı',
                  `${flightIata} - ${b.contactName || 'Müşteriniz'} | ${depDelayMin} dk gecikme. Pickup saatini buna göre ayarlayın.`,
                  { bookingId: b.id, flightNumber: flightIata, kind: 'DEP_DELAY', delayMin: depDelayMin }
                );
                updates.flightDepDelayNotifiedMin = depDelayMin;
              }
            }

            // Persist updates to booking metadata
            await prisma.booking.update({
              where: { id: b.id },
              data: { metadata: { ...meta, ...updates } }
            }).catch(e => console.warn('[FlightCheck] booking update err:', e.message));
          }
        }
      }
    } catch (err) {
      console.error('[FlightCheck] job error:', err.message);
    }
  };

  // Run every 5 minutes — uçak verisi 5 dk granülarite ile yeterli
  setInterval(checkUpcomingFlights, 5 * 60 * 1000);
  // First run after 30s to let server settle
  setTimeout(checkUpcomingFlights, 30 * 1000);
  console.log('✈️  Flight tracking job scheduled (every 5 minutes)');
});

// Trigger restart for env load
// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});