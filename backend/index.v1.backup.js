// backend/index.js
const express = require('express');
const cors = require('cors');
const prisma = require('./prismaClient'); // ✅ Tek prisma instance buradan geliyor

const app = express();
const PORT = 4000;

// ✅ Debug logları
console.log('✅ Prisma yüklendi mi?', !!prisma);
console.log('✅ prisma.booking var mı?', !!prisma.booking);

// ✅ Middleware'ler EN BAŞTA
app.use(cors({ origin: 'http://localhost:3001' }));
app.use(express.json());

// ========================================
// TEST ENDPOINT
// ========================================
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Backend çalışıyor!' });
});

// ========================================
// USERS
// ========================================
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        isActive: true,   // <-- BUNU EKLE
      },
    });
    res.json(users);
  } catch (err) {
    console.error('GET /api/users error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Kullanıcı aktif/pasif yap
app.patch('/api/users/:id/active', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { isActive } = req.body;

    console.log('PATCH /api/users/:id/active CALLED', { id, isActive });

    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı ID' });
    }

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isActive alanı boolean olmalıdır',
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return res.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error('PATCH /api/users/:id/active error:', error);
    return res.status(500).json({
      success: false,
      message: 'Durum güncellenemedi',
      error: String(error),
    });
  }
});

// Yeni kullanıcı oluştur
app.post('/api/users', async (req, res) => {
  try {
    const { name, email, password, role, isActive } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email zorunludur' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Bu email zaten kayıtlı' });
    }

    const user = await prisma.user.create({
      data: {
        name: name || null,
        email,
        passwordHash: password || null, // Gerçek projede bcrypt ile hash'lenmeli
        role: role || 'CUSTOMER',
        isActive: isActive !== undefined ? isActive : true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return res.json({ success: true, data: user });
  } catch (error) {
    console.error('POST /api/users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Kullanıcı oluşturulamadı',
      error: String(error),
    });
  }
});

// Kullanıcı güncelle
app.put('/api/users/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, email, password, role, isActive } = req.body;

    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı ID' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (password) updateData.passwordHash = password; // Gerçek projede bcrypt ile hash'lenmeli
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return res.json({ success: true, data: user });
  } catch (error) {
    console.error('PUT /api/users/:id error:', error);
    return res.status(500).json({
      success: false,
      message: 'Kullanıcı güncellenemedi',
      error: String(error),
    });
  }
});
// LOGIN - Basit authentication (email + password)
// NOT: Gerçek projede passwordHash + bcrypt kullanılmalı
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email ve şifre zorunludur.' });
    }

    // Basit örnek: user tablosunda email ve passwordHash kolonlarını kullanalım
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        passwordHash: true, // şimdilik düz şifre gibi davranıyoruz
      },
    });

    if (!user) {
      return res.status(401).json({ message: 'Geçersiz email veya şifre.' });
    }

    // DEMO: passwordHash = düz metin şifre gibi
    if (user.passwordHash !== password) {
      return res.status(401).json({ message: 'Geçersiz email veya şifre.' });
    }

    // Şifreyi response'tan çıkaralım
    const { passwordHash, ...safeUser } = user;

    // Normalde burada JWT üretilir, biz şimdilik frontend'e sadece user bilgisi döneceğiz
    return res.json({
      message: 'Giriş başarılı.',
      user: safeUser,
    });
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    res.status(500).json({ message: 'Sunucu hatası.' });
  }
});

// ========================================
// TRANSFERS
// ========================================

// Transfer arama endpoint'i
app.post('/api/transfers/search', async (req, res) => {
  try {
    const {
      pickup,
      dropoff,
      pickupDateTime,
      returnDateTime,
      passengers,
      childAges,
      babySeat,
      transferType,
    } = req.body;

    if (!pickup || !dropoff || !pickupDateTime) {
      return res.status(400).json({
        success: false,
        message: 'pickup, dropoff ve pickupDateTime zorunludur.',
      });
    }

    const basePrice = 50;
    const passengerFactor = passengers ? Math.max(1, passengers / 2) : 1;
    const childCount = Array.isArray(childAges) ? childAges.length : 0;
    const babySeatFee = babySeat ? 10 : 0;
    const roundTripFactor = transferType === 'ROUND_TRIP' ? 1.8 : 1;

    const calculatedPrice = basePrice * passengerFactor * roundTripFactor + babySeatFee;

    const results = [
      {
        id: 1,
        vehicleType: 'Sedan',
        vendor: 'SmartTransfer Partner 1',
        price: calculatedPrice,
        capacity: 3,
        cancellationPolicy: '24 saat öncesine kadar ücretsiz iptal',
        features: ['Klimali', 'İngilizce konuşan şoför'],
      },
      {
        id: 2,
        vehicleType: 'Minivan',
        vendor: 'SmartTransfer Partner 2',
        price: calculatedPrice + 20,
        capacity: 6,
        cancellationPolicy: '48 saat öncesine kadar ücretsiz iptal',
        features: ['Geniş bagaj', 'Çocuk koltuğu uygun'],
      },
      {
        id: 3,
        vehicleType: 'VIP Minibus',
        vendor: 'SmartTransfer Partner 3',
        price: calculatedPrice + 50,
        capacity: 12,
        cancellationPolicy: '72 saat öncesine kadar ücretsiz iptal',
        features: ['VIP karşılamalı', 'Wi-Fi', 'İkram'],
      },
    ];

    res.json({
      success: true,
      data: {
        pickup,
        dropoff,
        pickupDateTime,
        returnDateTime,
        passengers,
        childAges,
        babySeat,
        transferType,
        results,
      },
    });
  } catch (error) {
    console.error('POST /api/transfers/search error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========================================
// BOOKINGS
// ========================================

// Rezervasyon oluşturma
app.post('/api/bookings', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Gelen rezervasyon payload:', payload);

    const booking = await prisma.booking.create({
      data: {
        vehicleType: payload.vehicleType,
        vendor: payload.vendor,
        price: payload.price,
        capacity: payload.passengers || 1,

        pickup: payload.pickup,
        dropoff: payload.dropoff,
        pickupDateTime: payload.pickupDateTime
          ? new Date(payload.pickupDateTime)
          : null,
        returnDateTime: payload.returnDateTime
          ? new Date(payload.returnDateTime)
          : null,

        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        passengers: payload.passengers || 1,

        flightNumber: payload.flightNumber || null,
        flightArrivalTime: payload.flightArrivalTime
          ? new Date(payload.flightArrivalTime)
          : null,

        meetAndGreet: payload.meetAndGreet ? 'YES' : null,
        notes: payload.notes || null,

        status: 'PENDING',
      },
    });

    res.json({
      success: true,
      booking,
      message: 'Rezervasyon başarıyla oluşturuldu ve kaydedildi.',
    });
  } catch (err) {
    console.error('Booking API error:', err);
    res.status(500).json({
      message: 'Rezervasyon kaydedilirken hata oluştu',
      error: err.message,
    });
  }
});

// Tüm rezervasyonları listele
app.get('/api/bookings', async (req, res) => {
  try {
    const { status, paymentStatus, fromDate, toDate } = req.query;

    const where = {};

    if (status) {
      where.status = status;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    res.json({ success: true, data: bookings });
  } catch (error) {
    console.error('GET /api/bookings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Tek bir rezervasyonu ID'ye göre getir
app.get('/api/bookings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
    });

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Rezervasyon bulunamadı.' });
    }

    res.json({ success: true, data: booking });
  } catch (error) {
    console.error('GET /api/bookings/:id error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Rezervasyon durumunu güncelle
app.patch('/api/bookings/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['PENDING', 'CONFIRMED', 'CANCELLED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Geçersiz rezervasyon durumu.' });
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: parseInt(id) },
      data: { status },
    });

    res.json({ success: true, data: updatedBooking, message: 'Rezervasyon durumu güncellendi.' });
  } catch (error) {
    console.error('PATCH /api/bookings/:id/status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Rezervasyon ödeme durumunu güncelle
app.patch('/api/bookings/:id/payment-status', async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    if (!['PENDING', 'PAID', 'FAILED'].includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Geçersiz ödeme durumu.' });
    }

    const updatedBooking = await prisma.booking.update({
      where: { id: parseInt(id) },
      data: { paymentStatus },
    });

    res.json({ success: true, data: updatedBooking, message: 'Ödeme durumu güncellendi.' });
  } catch (error) {
    console.error('PATCH /api/bookings/:id/payment-status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Admin iç notlarını güncelle
app.patch('/api/bookings/:id/internal-notes', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { internalNotes } = req.body;

    const updated = await prisma.booking.update({
      where: { id },
      data: { internalNotes },
    });

    res.json({
      success: true,
      booking: updated,
    });
  } catch (err) {
    console.error('PATCH /api/bookings/:id/internal-notes error:', err);
    res.status(500).json({
      success: false,
      message: 'İç notlar güncellenirken hata oluştu',
      error: String(err?.message || err),
    });
  }
});

// ========================================
// VEHICLES
// ========================================

// Tüm araçları listele
app.get('/api/vehicles', async (req, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: { id: 'desc' },
    });
    res.json({ success: true, data: vehicles });
  } catch (err) {
    console.error('GET /api/vehicles error:', err);
    res.status(500).json({ success: false, message: 'Araçlar alınamadı' });
  }
});

// Yeni araç ekle
app.post('/api/vehicles', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload.name || !payload.plateNumber || !payload.capacity || !payload.vehicleType) {
      return res.status(400).json({
        success: false,
        message: 'name, plateNumber, capacity ve vehicleType zorunludur',
      });
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        name: payload.name,
        brand: payload.brand || null,
        model: payload.model || null,
        year: payload.year != null ? Number(payload.year) : null,
        color: payload.color || null,
        plateNumber: payload.plateNumber,
        capacity: Number(payload.capacity),
        luggage: payload.luggage != null ? Number(payload.luggage) : null,
        vehicleType: payload.vehicleType,
        vehicleClass: payload.vehicleClass || null,
        basePricePerKm:
          payload.basePricePerKm != null ? Number(payload.basePricePerKm) : null,
        basePricePerHour:
          payload.basePricePerHour != null ? Number(payload.basePricePerHour) : null,
        isCompanyOwned:
          payload.isCompanyOwned !== undefined
            ? Boolean(payload.isCompanyOwned)
            : true,
        hasBabySeat:
          payload.hasBabySeat !== undefined ? Boolean(payload.hasBabySeat) : false,
        maxBabySeats:
          payload.maxBabySeats != null ? Number(payload.maxBabySeats) : null,
        imageUrl: payload.imageUrl || null,
        description: payload.description || null,
        isActive:
          payload.isActive !== undefined ? Boolean(payload.isActive) : true,
        usageType: payload.usageType || 'TRANSFER',
        shuttleMode: payload.shuttleMode || null,
      },
    });

    res.json({ success: true, data: vehicle });
  } catch (err) {
    console.error('POST /api/vehicles error:', err);
    res.status(500).json({
      success: false,
      message: 'Araç eklenirken hata oluştu',
      error: String(err),
    });
  }
});

// Aracı güncelle
app.put('/api/vehicles/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const payload = req.body;

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        name: payload.name,
        brand: payload.brand,
        model: payload.model,
        year: payload.year != null ? Number(payload.year) : undefined,
        color: payload.color,
        plateNumber: payload.plateNumber,
        capacity: payload.capacity != null ? Number(payload.capacity) : undefined,
        luggage: payload.luggage != null ? Number(payload.luggage) : undefined,
        vehicleType: payload.vehicleType,
        vehicleClass: payload.vehicleClass,
        basePricePerKm:
          payload.basePricePerKm != null
            ? Number(payload.basePricePerKm)
            : undefined,
        basePricePerHour:
          payload.basePricePerHour != null
            ? Number(payload.basePricePerHour)
            : undefined,
        isCompanyOwned:
          payload.isCompanyOwned !== undefined
            ? Boolean(payload.isCompanyOwned)
            : undefined,
        hasBabySeat:
          payload.hasBabySeat !== undefined
            ? Boolean(payload.hasBabySeat)
            : undefined,
        maxBabySeats:
          payload.maxBabySeats != null ? Number(payload.maxBabySeats) : undefined,
        imageUrl: payload.imageUrl,
        description: payload.description,
        isActive:
          payload.isActive !== undefined ? Boolean(payload.isActive) : undefined,
        usageType: payload.usageType || undefined,
        shuttleMode: payload.shuttleMode || undefined,
      },
    });

    res.json({ success: true, data: vehicle });
  } catch (err) {
    console.error('PUT /api/vehicles/:id error:', err);
    res.status(500).json({
      success: false,
      message: 'Araç güncellenirken hata oluştu',
      error: String(err),
    });
  }
});

// Aracı aktif/pasif yap
app.patch('/api/vehicles/:id/active', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isActive } = req.body;

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: { isActive: Boolean(isActive) },
    });

    res.json({ success: true, data: vehicle });
  } catch (err) {
    console.error('PATCH /api/vehicles/:id/active error:', err);
    res.status(500).json({
      success: false,
      message: 'Araç aktif/pasif güncellenemedi',
      error: String(err),
    });
  }
});

// ========================================
// SHUTTLE ROUTES
// ========================================

// Tüm shuttle rotalarını listele
app.get('/api/shuttle-routes', async (req, res) => {
  try {
    const routes = await prisma.shuttleRoute.findMany({
      orderBy: { id: 'desc' },
      include: {
        vehicle: true,
      },
    });

    res.json({ success: true, data: routes });
  } catch (err) {
    console.error('GET /api/shuttle-routes error:', err);
    res.status(500).json({ success: false, message: 'Shuttle rotalar alınamadı' });
  }
});

// Yeni shuttle rotası ekle
app.post('/api/shuttle-routes', async (req, res) => {
  try {
    const {
      vehicleId,
      fromName,
      toName,
      scheduleType,
      departureTimes,
      pricePerSeat,
      maxSeats,
      isActive,
      weeklyDays,         // <--- YENİ
      customStartDate,    // <--- YENİ
      customEndDate,      // <--- YENİ
    } = req.body;

    const route = await prisma.shuttleRoute.create({
      data: {
        vehicleId: Number(vehicleId),
        fromName,
        toName,
        scheduleType: scheduleType || 'DAILY',
        departureTimes: JSON.stringify(departureTimes || []),
        pricePerSeat: Number(pricePerSeat),
        maxSeats: Number(maxSeats),
        isActive: isActive ?? true,
        weeklyDays: JSON.stringify(weeklyDays || []),     // <--- YENİ
        customStartDate: customStartDate || null,         // <--- YENİ
        customEndDate: customEndDate || null,             // <--- YENİ
      },
      include: {
        vehicle: true,
      },
    });

    res.json({ success: true, data: route });
  } catch (err) {
    console.error('POST /api/shuttle-routes error:', err);
    res.status(500).json({ success: false, message: 'Shuttle rota oluşturulamadı' });
  }
});

// Shuttle rotasını güncelle
app.put('/api/shuttle-routes/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      vehicleId,
      fromName,
      toName,
      scheduleType,
      departureTimes,
      pricePerSeat,
      maxSeats,
      isActive,
      weeklyDays,         // <--- YENİ
      customStartDate,    // <--- YENİ
      customEndDate,      // <--- YENİ
    } = req.body;

    const route = await prisma.shuttleRoute.update({
      where: { id },
      data: {
        vehicleId: Number(vehicleId),
        fromName,
        toName,
        scheduleType,
        departureTimes: JSON.stringify(departureTimes || []),
        pricePerSeat: Number(pricePerSeat),
        maxSeats: Number(maxSeats),
        isActive: isActive ?? true,
        weeklyDays: JSON.stringify(weeklyDays || []),     // <--- YENİ
        customStartDate: customStartDate || null,         // <--- YENİ
        customEndDate: customEndDate || null,             // <--- YENİ
      },
      include: {
        vehicle: true,
      },
    });

    res.json({ success: true, data: route });
  } catch (err) {
    console.error('PUT /api/shuttle-routes/:id error:', err);
    res.status(500).json({ success: false, message: 'Shuttle rota güncellenemedi' });
  }
});

// Shuttle rotasını aktif/pasif yap
app.patch('/api/shuttle-routes/:id/active', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { isActive } = req.body;

    const route = await prisma.shuttleRoute.update({
      where: { id },
      data: { isActive },
    });

    res.json({ success: true, data: route });
  } catch (err) {
    console.error('PATCH /api/shuttle-routes/:id/active error:', err);
    res.status(500).json({ success: false, message: 'Shuttle rota durumu güncellenemedi' });
  }
});

// ========================================
// ADMIN DASHBOARD
// ========================================

app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const totalBookings = await prisma.booking.count();
    const pendingBookings = await prisma.booking.count({
      where: { status: 'PENDING' },
    });
    const confirmedBookings = await prisma.booking.count({
      where: { status: 'CONFIRMED' },
    });
    const cancelledBookings = await prisma.booking.count({
      where: { status: 'CANCELLED' },
    });

    const latestBookings = await prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        fullName: true,
        pickup: true,
        dropoff: true,
        price: true,
        status: true,
        createdAt: true,
      },
    });

    const totalRevenueResult = await prisma.booking.aggregate({
      _sum: {
        price: true,
      },
      where: {
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      },
    });
    const totalRevenue = totalRevenueResult._sum.price || 0;

    res.json({
      success: true,
      data: {
        totalBookings,
        pendingBookings,
        confirmedBookings,
        cancelledBookings,
        latestBookings,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error('GET /api/admin/dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ========================================
// SERVER START
// ========================================
app.listen(PORT, () => {
  console.log(`Backend http://localhost:${PORT} adresinde çalışıyor`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});