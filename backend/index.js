// backend/index.js
// SmartTravel Platform - Main Server
// Version: 2.0.0 Enterprise

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

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

app.get('/api/ping', (req, res) => {
  res.json({
    success: true,
    message: 'SmartTravel API is running!',
    version: '2.1.2'
  });
});

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


// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

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
    methods: ['GET', 'POST']
  }
});

// Import socket handler
require('./src/socket/driverHandler')(io, app);

// Make io accessible to our router
app.set('io', io);

server.listen(PORT, () => {
  console.log('');
  console.log('🚀 ========================================');
  console.log('🚀  SmartTravel Platform API');
  console.log('🚀 ========================================');
  console.log(`🚀  Version: 2.0.0 Enterprise`);
  console.log(`🚀  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🚀  Port: ${PORT}`);
  console.log(`🚀  URL: http://localhost:${PORT}`);
  console.log('🚀 ========================================');
  console.log('');
  console.log('📚 Available endpoints:');
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

  // ==========================================================================
  // 1-MINUTE SILENT PUSH JOB
  // Wakes up driver apps even when force-closed (like WhatsApp / tracking apps)
  // ==========================================================================
  const { Expo } = require('expo-server-sdk');
  const expo = new Expo({ useFcmV1: true });
  const prisma = require('./src/lib/prisma');

  const sendSilentPushToDrivers = async () => {
    try {
      // Find all drivers who have a push token and logged in within last 24h
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
          data: { type: 'LOCATION_REQUEST', timestamp: Date.now() }
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
                pushPrisma.user.updateMany({
                  where: { pushToken: messages[i].to },
                  data: { pushToken: null }
                }).catch(() => { });
              }
            }
          });
          console.log(`[Push] Sent silent wake-up to ${messages.length} driver(s)`);
        } catch (err) {
          console.error('[Push] Error sending chunk:', err.message);
        }
      }
    } catch (err) {
      console.error('[Push] Silent push job error:', err.message);
    }
  };

  // Run every 60 seconds
  setInterval(sendSilentPushToDrivers, 60 * 1000);
  console.log('📡 Silent push job started (every 60 seconds)');
});

// Trigger restart for env load
// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});