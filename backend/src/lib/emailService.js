/**
 * Email Service - Tenant-aware email sending with Nodemailer
 * Supports per-tenant SMTP settings stored in tenant.settings.emailSettings
 */

const nodemailer = require('nodemailer');
const prisma = require('./prisma');

/**
 * Get SMTP transport for a specific tenant
 */
async function getTransporter(tenantId) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true }
    });

    const emailSettings = tenant?.settings?.emailSettings;
    if (!emailSettings || !emailSettings.smtpHost || !emailSettings.smtpUser || !emailSettings.smtpPass) {
        throw new Error('E-posta ayarları yapılandırılmamış. Sistem Tanımlamaları > E-posta Ayarları kısmından SMTP bilgilerinizi girin.');
    }

    const transporter = nodemailer.createTransport({
        host: emailSettings.smtpHost,
        port: Number(emailSettings.smtpPort) || 587,
        secure: emailSettings.smtpSecure === true || emailSettings.smtpPort === 465,
        auth: {
            user: emailSettings.smtpUser,
            pass: emailSettings.smtpPass,
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    return { transporter, emailSettings };
}

/**
 * Get the voucher email template for a tenant
 * Returns the HTML template string with {{placeholders}}
 */
async function getVoucherTemplate(tenantId) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true, name: true }
    });

    const customTemplate = tenant?.settings?.emailTemplate?.voucherHtml;
    if (customTemplate && customTemplate.trim()) {
        return customTemplate;
    }

    // Default professional voucher template
    return DEFAULT_VOUCHER_TEMPLATE;
}

/**
 * Replace template placeholders with actual booking data
 */
function renderTemplate(template, data) {
    let html = template;
    Object.entries(data).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        html = html.replace(regex, value != null ? String(value) : '');
    });
    return html;
}

/**
 * Send booking voucher email to customer
 */
async function sendBookingVoucher(tenantId, booking) {
    try {
        // Check if auto-send is enabled
        const tenantCheck = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { settings: true }
        });
        const autoSend = tenantCheck?.settings?.emailSettings?.autoSendVoucher;
        if (autoSend === false) {
            console.log(`[EMAIL] Auto-send voucher is disabled for tenant ${tenantId}, skipping.`);
            return { success: true, skipped: true };
        }

        const { transporter, emailSettings } = await getTransporter(tenantId);
        const template = await getVoucherTemplate(tenantId);

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true, settings: true }
        });

        const branding = tenant?.settings?.branding || {};
        const companyName = branding.companyName || tenant?.name || 'SmartTransfer';
        const companyPhone = branding.phone || '';
        const companyEmail = branding.email || emailSettings.senderEmail || '';
        const logoUrl = branding.logoUrl || '';

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
            passengerEmail: booking.contactEmail || '',
            passengerPhone: booking.contactPhone || '',
            pickup: metadata.pickup || '',
            dropoff: metadata.dropoff || '',
            date: formattedDate,
            time: formattedTime,
            vehicleType: metadata.vehicleType || '',
            flightNumber: metadata.flightNumber || '',
            adults: booking.adults || 1,
            children: booking.children || 0,
            infants: booking.infants || 0,
            totalPassengers: (booking.adults || 1) + (booking.children || 0) + (booking.infants || 0),
            price: booking.total ? Number(booking.total).toFixed(2) : '0.00',
            currency: booking.currency || 'EUR',
            notes: booking.specialRequests || '',
            companyName: companyName,
            companyPhone: companyPhone,
            companyEmail: companyEmail,
            logoUrl: logoUrl,
            status: booking.status || 'CONFIRMED',
            year: new Date().getFullYear(),
        };

        const html = renderTemplate(template, templateData);

        const senderName = emailSettings.senderName || companyName;
        const senderEmail = emailSettings.senderEmail || emailSettings.smtpUser;

        const mailOptions = {
            from: `"${senderName}" <${senderEmail}>`,
            to: booking.contactEmail,
            subject: emailSettings.voucherSubject
                ? renderTemplate(emailSettings.voucherSubject, templateData)
                : `Rezervasyon Onayı - ${booking.bookingNumber} | ${companyName}`,
            html: html,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Voucher sent to ${booking.contactEmail} for booking ${booking.bookingNumber}. MessageId: ${info.messageId}`);

        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`[EMAIL] Failed to send voucher for booking ${booking.bookingNumber}:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send a test email to verify SMTP settings
 */
async function sendTestEmail(tenantId, toEmail) {
    try {
        const { transporter, emailSettings } = await getTransporter(tenantId);

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true, settings: true }
        });
        const companyName = tenant?.settings?.branding?.companyName || tenant?.name || 'SmartTransfer';
        const senderName = emailSettings.senderName || companyName;
        const senderEmail = emailSettings.senderEmail || emailSettings.smtpUser;

        await transporter.sendMail({
            from: `"${senderName}" <${senderEmail}>`,
            to: toEmail,
            subject: `Test E-postası - ${companyName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; text-align: center;">
                    <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 28px;">✓</div>
                    <h2 style="color: #1e293b; margin-bottom: 8px;">E-posta Bağlantısı Başarılı!</h2>
                    <p style="color: #64748b; font-size: 14px;">Bu test e-postası <strong>${companyName}</strong> tarafından gönderilmiştir.</p>
                    <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">SMTP ayarlarınız doğru yapılandırılmış. Rezervasyon voucher e-postaları otomatik olarak gönderilecektir.</p>
                </div>
            `,
        });

        return { success: true };
    } catch (error) {
        console.error('[EMAIL] Test email failed:', error.message);
        return { success: false, error: error.message };
    }
}

// ─── Default Voucher Template ───
const DEFAULT_VOUCHER_TEMPLATE = `<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:24px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:16px 16px 0 0;padding:32px;text-align:center;">
    {{#if logoUrl}}<img src="{{logoUrl}}" alt="{{companyName}}" style="max-height:40px;margin-bottom:16px;filter:brightness(0) invert(1);"/>{{/if}}
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:700;">Rezervasyon Onayı</h1>
    <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Rezervasyonunuz başarıyla oluşturulmuştur</p>
  </div>

  <!-- Booking Number Badge -->
  <div style="background:#fff;padding:20px 32px;text-align:center;border-bottom:2px dashed #e2e8f0;">
    <span style="background:#dbeafe;color:#1e40af;padding:8px 20px;border-radius:24px;font-size:15px;font-weight:700;letter-spacing:1px;">
      {{bookingNumber}}
    </span>
  </div>

  <!-- Content -->
  <div style="background:#fff;padding:32px;border-radius:0 0 16px 16px;">

    <!-- Passenger Info -->
    <div style="margin-bottom:24px;">
      <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:600;letter-spacing:1px;margin-bottom:12px;">Yolcu Bilgileri</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:130px;">Ad Soyad</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{passengerName}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">E-posta</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{passengerEmail}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Telefon</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{passengerPhone}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Yolcu Sayısı</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{totalPassengers}} kişi</td></tr>
      </table>
    </div>

    <div style="border-top:1px solid #f1f5f9;margin:0 -32px;"></div>

    <!-- Transfer Details -->
    <div style="margin-top:24px;margin-bottom:24px;">
      <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:600;letter-spacing:1px;margin-bottom:12px;">Transfer Detayları</div>

      <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;margin-bottom:10px;">
          <div style="width:24px;height:24px;background:#10b981;border-radius:50%;color:#fff;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:12px;flex-shrink:0;">A</div>
          <div>
            <div style="font-size:11px;color:#94a3b8;">Alış Noktası</div>
            <div style="font-size:14px;font-weight:600;color:#1e293b;">{{pickup}}</div>
          </div>
        </div>
        <div style="display:flex;">
          <div style="width:24px;height:24px;background:#ef4444;border-radius:50%;color:#fff;text-align:center;line-height:24px;font-size:12px;font-weight:700;margin-right:12px;flex-shrink:0;">B</div>
          <div>
            <div style="font-size:11px;color:#94a3b8;">Varış Noktası</div>
            <div style="font-size:14px;font-weight:600;color:#1e293b;">{{dropoff}}</div>
          </div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:130px;">Tarih</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{date}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Saat</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{time}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Araç Tipi</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{vehicleType}}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Uçuş No</td><td style="padding:8px 0;font-weight:600;color:#1e293b;font-size:14px;">{{flightNumber}}</td></tr>
      </table>
    </div>

    <div style="border-top:1px solid #f1f5f9;margin:0 -32px;"></div>

    <!-- Price -->
    <div style="margin-top:24px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;border-radius:12px;padding:20px;text-align:center;">
      <div style="font-size:11px;text-transform:uppercase;color:#16a34a;font-weight:600;letter-spacing:1px;">Toplam Tutar</div>
      <div style="font-size:32px;font-weight:800;color:#15803d;margin-top:4px;">{{price}} {{currency}}</div>
    </div>

    <!-- Notes -->
    <div style="margin-top:24px;padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;font-size:13px;color:#92400e;">
      <strong>Önemli Bilgiler:</strong>
      <ul style="margin:8px 0 0;padding-left:18px;line-height:1.8;">
        <li>Şoförünüz belirtilen saatte sizi karşılayacaktır.</li>
        <li>Havalimanı transferlerinde isim tabelası ile karşılama yapılır.</li>
        <li>İptal ve değişiklik için en az 24 saat öncesinden bilgi veriniz.</li>
      </ul>
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:24px;color:#94a3b8;font-size:12px;">
    <p style="margin:0 0 4px;font-weight:600;color:#64748b;">{{companyName}}</p>
    <p style="margin:0;">{{companyPhone}} | {{companyEmail}}</p>
    <p style="margin:12px 0 0;font-size:11px;">&copy; {{year}} {{companyName}}. Tüm hakları saklıdır.</p>
  </div>

</div>
</body>
</html>`;

module.exports = {
    sendBookingVoucher,
    sendTestEmail,
    getTransporter,
    getVoucherTemplate,
    renderTemplate,
    DEFAULT_VOUCHER_TEMPLATE,
};
