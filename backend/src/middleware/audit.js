const { logActivity } = require('../utils/logger');

// Human-readable action labels
const ACTION_LABELS = {
    'POST': 'Oluşturma',
    'PUT': 'Güncelleme',
    'PATCH': 'Kısmi Güncelleme',
    'DELETE': 'Silme'
};

const ENTITY_LABELS = {
    'USERS': 'Kullanıcı',
    'BOOKINGS': 'Rezervasyon',
    'VEHICLES': 'Araç',
    'VEHICLE-TYPES': 'Araç Tipi',
    'TENANT': 'Sistem Ayarları',
    'AGENCY': 'Acente',
    'DRIVERS': 'Şoför',
    'OPERATIONS': 'Operasyon',
    'KASA': 'Kasa İşlemi',
    'TRANSFER': 'Transfer',
    'SHUTTLE-ROUTES': 'Shuttle Rota',
    'ZONES': 'Bölge/Zon',
    'PAYMENT': 'Ödeme',
    'AUTH': 'Kimlik Doğrulama',
    'ADMIN': 'Yönetim',
    'REPORTS': 'Rapor',
    'MESSAGES': 'Mesaj'
};

// Fields to track for change detection
const SENSITIVE_FIELDS = ['password', 'passwordHash', 'token', 'accessToken', 'refreshToken'];
const PRICE_FIELDS = ['price', 'amount', 'basePrice', 'providerPrice', 'totalPrice', 'pricePerSeat', 'fixedPrice', 'extraKmPrice', 'basePricePerKm', 'openingFee', 'commission', 'markup', 'discount'];

function sanitizeBody(body) {
    if (!body || typeof body !== 'object') return body;
    const safe = { ...body };
    SENSITIVE_FIELDS.forEach(f => { if (safe[f]) safe[f] = '***'; });
    // Deep clean nested objects
    if (safe.metadata && typeof safe.metadata === 'object') {
        safe.metadata = { ...safe.metadata };
        SENSITIVE_FIELDS.forEach(f => { if (safe.metadata[f]) safe.metadata[f] = '***'; });
    }
    return safe;
}

function buildMessage(method, entityLabel, entityId, body) {
    const actionLabel = ACTION_LABELS[method] || method;
    let msg = `${entityLabel} ${actionLabel.toLowerCase()}`;
    
    if (entityId) msg += ` (ID: ${entityId})`;

    // Add specifics based on payload
    const extras = [];
    if (body?.status) extras.push(`Durum: ${body.status}`);
    if (body?.role) extras.push(`Rol: ${body.role}`);
    if (body?.isActive !== undefined) extras.push(`Aktif: ${body.isActive ? 'Evet' : 'Hayır'}`);
    if (body?.name || body?.fullName) extras.push(`Ad: ${body.name || body.fullName}`);
    if (body?.email) extras.push(`E-posta: ${body.email}`);
    
    // Price changes
    PRICE_FIELDS.forEach(f => {
        if (body?.[f] !== undefined) extras.push(`${f}: ${body[f]}`);
    });

    if (extras.length > 0) msg += ` — ${extras.join(', ')}`;
    return msg;
}

/**
 * Express middleware to automatically log all mutating requests
 * (POST, PUT, PATCH, DELETE) to the ActivityLog table.
 */
function auditLogMiddleware(req, res, next) {
    // Only log mutations
    if (['GET', 'OPTIONS', 'HEAD'].includes(req.method)) {
        return next();
    }

    // Capture the previous state if set by route handlers (optional enhancement)
    // Route handlers can set req._auditPreviousState before making changes

    // Wait for the request to finish to check status code
    res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
            const tenantId = req.tenant?.id || req.user?.tenantId;
            const userId = req.user?.id || null;
            const userEmail = req.user?.email || null;
            const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

            const segments = req.path.split('/').filter(Boolean);
            const apiIndex = segments.indexOf('api');
            let entityType = 'System';
            let entityId = null;
            let subAction = null;

            if (apiIndex >= 0 && segments.length > apiIndex + 1) {
                entityType = segments[apiIndex + 1].toUpperCase();
                if (segments.length > apiIndex + 2) {
                    const possibleId = segments[apiIndex + 2];
                    // Check if it looks like a UUID or numeric ID
                    if (/^[0-9a-f-]{8,}$/i.test(possibleId) || /^\d+$/.test(possibleId)) {
                        entityId = possibleId;
                        // Check for sub-action like /api/users/:id/active
                        if (segments.length > apiIndex + 3) {
                            subAction = segments[apiIndex + 3];
                        }
                    } else {
                        // It's a sub-resource like /api/admin/logs
                        entityType = `${entityType}/${possibleId}`.toUpperCase();
                    }
                }
            }

            const safeBody = sanitizeBody(req.body);
            const entityLabel = ENTITY_LABELS[entityType] || entityType;
            
            // Build descriptive action name
            let action;
            if (req.method === 'DELETE') action = `DELETE_${entityType}`;
            else if (req.method === 'POST') action = `CREATE_${entityType}`;
            else if (req.method === 'PUT') action = `UPDATE_${entityType}`;
            else if (req.method === 'PATCH') {
                action = subAction ? `PATCH_${entityType}_${subAction.toUpperCase()}` : `UPDATE_${entityType}`;
            } else {
                action = `${req.method}_${entityType}`;
            }

            const message = buildMessage(req.method, entityLabel, entityId, req.body);

            // Detect changed price fields
            const priceChanges = {};
            PRICE_FIELDS.forEach(f => {
                if (req.body?.[f] !== undefined) {
                    priceChanges[f] = {
                        new: req.body[f],
                        old: req._auditPreviousState?.[f] ?? null
                    };
                }
            });

            logActivity({
                tenantId,
                userId,
                userEmail,
                action,
                entityType,
                entityId,
                details: {
                    endpoint: req.originalUrl,
                    method: req.method,
                    message,
                    payload: safeBody,
                    previousState: req._auditPreviousState || null,
                    priceChanges: Object.keys(priceChanges).length > 0 ? priceChanges : null,
                    subAction: subAction || null,
                    status: res.statusCode
                },
                ipAddress
            });
        }
    });

    next();
}

module.exports = {
    auditLogMiddleware
};
