/**
 * WhatsApp Service - Tenant-aware WhatsApp messaging
 * Supports multiple providers:
 *   1. WhatsApp Business Cloud API (Meta Official)
 *   2. Green API (popular third-party)
 *   3. Custom Webhook (flexible)
 * 
 * Settings stored in tenant.settings.whatsappSettings
 */

const axios = require('axios');
const prisma = require('./prisma');

/**
 * Normalize phone number to international format (strip spaces, dashes, add country code)
 */
function normalizePhone(phone) {
    if (!phone) return null;
    // Remove all non-digit characters except leading +
    let cleaned = phone.replace(/[^\d+]/g, '');
    // Remove leading + if present
    if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
    // If starts with 0, assume Turkey and replace with 90
    if (cleaned.startsWith('0')) cleaned = '90' + cleaned.slice(1);
    // If length is 10 (e.g. 5551234567), prepend 90
    if (cleaned.length === 10 && cleaned.startsWith('5')) cleaned = '90' + cleaned;
    return cleaned;
}

/**
 * Get WhatsApp settings for a tenant
 */
async function getWhatsAppSettings(tenantId) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true, name: true }
    });
    const ws = tenant?.settings?.whatsappSettings;
    if (!ws || !ws.provider || !ws.enabled) {
        return null;
    }
    return { settings: ws, tenant };
}

/**
 * Replace {{placeholders}} in message template
 */
function renderMessage(template, data) {
    let msg = template;
    Object.entries(data).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        msg = msg.replace(regex, value != null ? String(value) : '');
    });
    return msg;
}

/**
 * Send via WhatsApp Business Cloud API (Meta Official)
 */
async function sendViaMeta(settings, phone, message) {
    const { metaPhoneNumberId, metaAccessToken } = settings;
    if (!metaPhoneNumberId || !metaAccessToken) {
        throw new Error('Meta WhatsApp API ayarları eksik (Phone Number ID / Access Token)');
    }

    const res = await axios.post(
        `https://graph.facebook.com/v18.0/${metaPhoneNumberId}/messages`,
        {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body: message }
        },
        {
            headers: {
                'Authorization': `Bearer ${metaAccessToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        }
    );

    return { success: true, messageId: res.data?.messages?.[0]?.id };
}

/**
 * Send via Green API
 */
async function sendViaGreenApi(settings, phone, message) {
    const { greenApiInstance, greenApiToken } = settings;
    if (!greenApiInstance || !greenApiToken) {
        throw new Error('Green API ayarları eksik (Instance ID / Token)');
    }

    const chatId = `${phone}@c.us`;
    const res = await axios.post(
        `https://api.green-api.com/waInstance${greenApiInstance}/sendMessage/${greenApiToken}`,
        { chatId, message },
        { timeout: 15000 }
    );

    return { success: true, messageId: res.data?.idMessage };
}

/**
 * Send via Custom Webhook (POST request)
 */
async function sendViaWebhook(settings, phone, message) {
    const { webhookUrl, webhookHeaders } = settings;
    if (!webhookUrl) {
        throw new Error('Webhook URL tanımlanmamış');
    }

    let headers = { 'Content-Type': 'application/json' };
    if (webhookHeaders) {
        try {
            const parsed = typeof webhookHeaders === 'string' ? JSON.parse(webhookHeaders) : webhookHeaders;
            headers = { ...headers, ...parsed };
        } catch (e) { /* ignore parse errors */ }
    }

    const res = await axios.post(
        webhookUrl,
        { phone, message },
        { headers, timeout: 15000 }
    );

    return { success: true, data: res.data };
}

/**
 * Send WhatsApp message using configured provider
 */
async function sendWhatsAppMessage(tenantId, phone, message) {
    const config = await getWhatsAppSettings(tenantId);
    if (!config) {
        return { success: false, error: 'WhatsApp ayarları yapılandırılmamış veya devre dışı' };
    }

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
        return { success: false, error: `Geçersiz telefon numarası: ${phone}` };
    }

    const { settings } = config;

    try {
        let result;
        switch (settings.provider) {
            case 'meta':
                result = await sendViaMeta(settings, normalizedPhone, message);
                break;
            case 'greenapi':
                result = await sendViaGreenApi(settings, normalizedPhone, message);
                break;
            case 'webhook':
                result = await sendViaWebhook(settings, normalizedPhone, message);
                break;
            default:
                return { success: false, error: `Bilinmeyen sağlayıcı: ${settings.provider}` };
        }
        console.log(`[WHATSAPP] Message sent to ${normalizedPhone} via ${settings.provider}`);
        return result;
    } catch (error) {
        console.error(`[WHATSAPP] Send failed to ${normalizedPhone}:`, error.response?.data || error.message);
        return { success: false, error: error.response?.data?.error?.message || error.message };
    }
}

/**
 * Send booking voucher WhatsApp to customer
 */
async function sendBookingWhatsApp(tenantId, booking) {
    try {
        const config = await getWhatsAppSettings(tenantId);
        if (!config) {
            return { success: true, skipped: true };
        }

        const { settings, tenant } = config;

        if (!booking.contactPhone) {
            console.log('[WHATSAPP] No phone number for booking', booking.bookingNumber);
            return { success: false, error: 'Telefon numarası yok' };
        }

        const branding = tenant?.settings?.branding || {};
        const companyName = branding.companyName || tenant?.name || 'SmartTransfer';
        const metadata = booking.metadata || {};
        const pickupDate = booking.startDate ? new Date(booking.startDate) : null;
        const formattedDate = pickupDate
            ? pickupDate.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '';
        const formattedTime = pickupDate
            ? pickupDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            : '';

        const templateData = {
            bookingNumber: booking.bookingNumber || '',
            passengerName: booking.contactName || '',
            pickup: metadata.pickup || '',
            dropoff: metadata.dropoff || '',
            date: formattedDate,
            time: formattedTime,
            vehicleType: metadata.vehicleType || '',
            flightNumber: metadata.flightNumber || '',
            totalPassengers: String((booking.adults || 1) + (booking.children || 0) + (booking.infants || 0)),
            price: booking.total ? Number(booking.total).toFixed(2) : '0.00',
            currency: booking.currency || 'EUR',
            companyName: companyName,
            companyPhone: branding.phone || '',
        };

        // Use custom template or default
        const messageTemplate = settings.voucherMessage || DEFAULT_VOUCHER_MESSAGE;
        const message = renderMessage(messageTemplate, templateData);

        const result = await sendWhatsAppMessage(tenantId, booking.contactPhone, message);
        if (result.success) {
            console.log(`[WHATSAPP] Voucher sent to ${booking.contactPhone} for ${booking.bookingNumber}`);
        }
        return result;
    } catch (error) {
        console.error(`[WHATSAPP] Voucher failed for ${booking.bookingNumber}:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send a test WhatsApp message
 */
async function sendTestWhatsApp(tenantId, phone) {
    const config = await getWhatsAppSettings(tenantId);
    if (!config) {
        throw new Error('WhatsApp ayarları yapılandırılmamış veya devre dışı');
    }
    const companyName = config.tenant?.settings?.branding?.companyName || config.tenant?.name || 'SmartTransfer';
    const message = `✅ *WhatsApp Bağlantı Testi Başarılı!*\n\nBu test mesajı *${companyName}* tarafından gönderilmiştir.\n\nWhatsApp entegrasyonunuz aktif ve çalışıyor. Rezervasyon mesajları otomatik olarak gönderilecektir.`;

    return await sendWhatsAppMessage(tenantId, phone, message);
}

// ─── Default Voucher Message ───
const DEFAULT_VOUCHER_MESSAGE = `✅ *Rezervasyon Onayı*

Sayın *{{passengerName}}*,
Rezervasyonunuz başarıyla oluşturulmuştur.

📋 *PNR:* {{bookingNumber}}

🚗 *Transfer Detayları:*
📍 Alış: {{pickup}}
📍 Varış: {{dropoff}}
📅 Tarih: {{date}}
🕐 Saat: {{time}}
🚙 Araç: {{vehicleType}}
✈️ Uçuş: {{flightNumber}}
👥 Yolcu: {{totalPassengers}} kişi

💰 *Tutar:* {{price}} {{currency}}

ℹ️ Şoförünüz belirtilen saatte sizi karşılayacaktır.
İptal/değişiklik için en az 24 saat öncesinden bilgi veriniz.

_{{companyName}}_
📞 {{companyPhone}}`;

module.exports = {
    sendWhatsAppMessage,
    sendBookingWhatsApp,
    sendTestWhatsApp,
    normalizePhone,
    renderMessage,
    DEFAULT_VOUCHER_MESSAGE,
};
