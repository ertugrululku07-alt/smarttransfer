// src/services/AIOperationAdvisor.js
// AI-powered operation advisor using Google Gemini API

// ---------------------------------------------------------------------------
// Helper: format driver schedule for the prompt
// ---------------------------------------------------------------------------
const formatDriverSchedule = (driver, existingBookings) => {
    const driverBookings = existingBookings.filter(b => b.driverId === driver.userId);
    if (driverBookings.length === 0) return `${driver.firstName} ${driver.lastName}: Boş gün`;

    const list = driverBookings.map(b => {
        const start = new Date(b.startDate).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        const dur = b.metadata?.estimatedDurationMinutes || 120;
        const end = new Date(new Date(b.startDate).getTime() + (dur + 30) * 60000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        return `${start}-${end} (${b.metadata?.pickup || '?'} → ${b.metadata?.dropoff || '?'})`;
    }).join(' | ');

    return `${driver.firstName} ${driver.lastName}: ${list}`;
};

// ---------------------------------------------------------------------------
// Helper: check if driver is free at given time
// ---------------------------------------------------------------------------
const isDriverFree = (driver, booking, existingBookings) => {
    const newStart = new Date(booking.startDate);
    const newDur = booking.metadata?.estimatedDurationMinutes || 120;
    const newEnd = new Date(newStart.getTime() + (newDur + 30) * 60000);

    const conflicts = existingBookings.filter(b => {
        if (b.driverId !== driver.userId) return false;
        const bStart = new Date(b.startDate);
        const bDur = b.metadata?.estimatedDurationMinutes || 120;
        const bEnd = new Date(bStart.getTime() + (bDur + 30) * 60000);
        return newStart < bEnd && bStart < newEnd;
    });

    return conflicts.length === 0;
};

// ---------------------------------------------------------------------------
// Helper: check if vehicle is free at given time
// ---------------------------------------------------------------------------
const isVehicleFree = (vehicle, booking, existingBookings) => {
    const newStart = new Date(booking.startDate);
    const newDur = booking.metadata?.estimatedDurationMinutes || 120;
    const newEnd = new Date(newStart.getTime() + (newDur + 30) * 60000);

    const conflicts = existingBookings.filter(b => {
        if (b.metadata?.assignedVehicleId !== vehicle.id) return false;
        const bStart = new Date(b.startDate);
        const bDur = b.metadata?.estimatedDurationMinutes || 120;
        const bEnd = new Date(bStart.getTime() + (bDur + 30) * 60000);
        return newStart < bEnd && bStart < newEnd;
    });

    return conflicts.length === 0;
};

// ---------------------------------------------------------------------------
// Main: suggest best driver + vehicle for a booking
// ---------------------------------------------------------------------------
const suggestAssignment = async (booking, drivers, vehicles, existingBookings) => {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY env değişkeni ayarlanmamış');
    }

    const pickupDateTime = new Date(booking.startDate).toLocaleString('tr-TR', {
        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });

    const isShuttle = (booking.metadata?.vehicleType || '').toLowerCase().includes('shuttle') ||
        (booking.metadata?.vehicleType || '').toLowerCase().includes('paylaşımlı');

    // Filter available drivers
    const availableDrivers = drivers.filter(d => isDriverFree(d, booking, existingBookings));
    const allDriversSchedule = drivers.map(d => formatDriverSchedule(d, existingBookings)).join('\n');

    // Filter available vehicles
    const relevantVehicles = isShuttle
        ? vehicles.filter(v => v.metadata?.usageType === 'SHUTTLE' || v.metadata?.shuttleMode)
        : vehicles.filter(v => v.metadata?.usageType !== 'SHUTTLE' && !v.metadata?.shuttleMode);

    const availableVehicles = relevantVehicles.filter(v => isVehicleFree(v, booking, existingBookings));

    // Build prompt for Gemini
    const prompt = `Sen bir profesyonel transfer operasyon asistanısın. Aşağıdaki transfere en uygun şöförü ve aracı öner.

## Transfer Bilgisi
- Rezervasyon No: ${booking.bookingNumber}
- Alış Yeri: ${booking.metadata?.pickup || 'Belirtilmemiş'}
- Bırakış Yeri: ${booking.metadata?.dropoff || 'Belirtilmemiş'}
- Tarih/Saat: ${pickupDateTime}
- Araç Tipi: ${booking.metadata?.vehicleType || 'Standart'}
- Yolcu Sayısı: ${booking.adults || 1}
- Transfer Süresi: ${booking.metadata?.estimatedDurationMinutes || 120} dakika

## Müsait Şöförler (çakışmasız)
${availableDrivers.length > 0
            ? availableDrivers.map(d => `- ${d.firstName} ${d.lastName} (ID: ${d.userId})`).join('\n')
            : 'Tüm şöförler meşgul'}

## Tüm Şöförlerin Günlük Programı
${allDriversSchedule}

## Müsait Araçlar (çakışmasız, doğru tip)
${availableVehicles.length > 0
            ? availableVehicles.map(v => `- ${v.plateNumber} ${v.brand} ${v.model} (ID: ${v.id})`).join('\n')
            : 'Uygun araç bulunamadı'}

Lütfen aşağıdaki JSON formatında yanıt ver ve SADECE JSON döndür (açıklama yazma):
{
  "suggestedDriverId": "<userId veya null>",
  "suggestedDriverName": "<ad soyad veya null>",
  "suggestedVehicleId": "<vehicleId veya null>",
  "suggestedVehiclePlate": "<plaka veya null>",
  "confidence": "high|medium|low",
  "reason": "<Türkçe kısa açıklama, max 2 cümle>",
  "warnings": ["<varsa uyarılar>"]
}`;

    // Initialize OpenRouter client using OpenAI library structure
    const OpenAI = require('openai');
    const openai = new OpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY,
        defaultHeaders: {
            "HTTP-Referer": "https://webtecari.xyz", // Required by OpenRouter
            "X-Title": "SmartTransfer" // Optional
        }
    });

    try {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: "You output strictly valid JSON." },
                { role: "user", content: prompt }
            ],
            model: "google/gemini-2.0-flash-lite-001", // Exact model ID available today
            response_format: { type: "json_object" },
            temperature: 0.1
        });

        const text = completion.choices[0].message.content;
        const suggestion = JSON.parse(text);

        return {
            ...suggestion,
            availableDrivers: availableDrivers.length,
            availableVehicles: availableVehicles.length,
            bookingInfo: {
                pickup: booking.metadata?.pickup,
                dropoff: booking.metadata?.dropoff,
                estimatedDurationMinutes: booking.metadata?.estimatedDurationMinutes || 120
            }
        };
    } catch (e) {
        throw new Error('OpenRouter API hatası: ' + e.message);
    }
};

module.exports = { suggestAssignment };
