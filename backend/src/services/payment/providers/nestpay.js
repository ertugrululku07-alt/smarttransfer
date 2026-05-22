/**
 * NestPay (EST/Asseco) 3D Secure Payment Provider
 * Supports: Ziraat, İş Bankası, Halkbank, Akbank, QNB Finansbank, TEB, Denizbank, ING, Şekerbank
 */
const crypto = require('crypto');
const axios = require('axios');

// ── Bank Gateway URLs ────────────────────────────────────────────
const BANK_GATEWAYS = {
    ziraat: {
        name: 'Ziraat Bankası',
        test3D: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
        prod3D: 'https://sanalpos2.ziraatbank.com.tr/fim/est3Dgate',
        testApi: 'https://entegrasyon.asseco-see.com.tr/fim/api',
        prodApi: 'https://sanalpos2.ziraatbank.com.tr/fim/api',
    },
    isbank: {
        name: 'İş Bankası',
        test3D: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
        prod3D: 'https://sanalpos.isbank.com.tr/fim/est3Dgate',
        testApi: 'https://entegrasyon.asseco-see.com.tr/fim/api',
        prodApi: 'https://sanalpos.isbank.com.tr/fim/api',
    },
    akbank: {
        name: 'Akbank',
        test3D: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
        prod3D: 'https://www.sanalakpos.com/fim/est3Dgate',
        testApi: 'https://entegrasyon.asseco-see.com.tr/fim/api',
        prodApi: 'https://www.sanalakpos.com/fim/api',
    },
    halkbank: {
        name: 'Halkbank',
        test3D: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
        prod3D: 'https://sanalpos.halkbank.com.tr/fim/est3Dgate',
        testApi: 'https://entegrasyon.asseco-see.com.tr/fim/api',
        prodApi: 'https://sanalpos.halkbank.com.tr/fim/api',
    },
    finansbank: {
        name: 'QNB Finansbank',
        test3D: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
        prod3D: 'https://www.fbwebpos.com/fim/est3Dgate',
        testApi: 'https://entegrasyon.asseco-see.com.tr/fim/api',
        prodApi: 'https://www.fbwebpos.com/fim/api',
    },
    teb: {
        name: 'TEB',
        test3D: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
        prod3D: 'https://sanalpos.teb.com.tr/fim/est3Dgate',
        testApi: 'https://entegrasyon.asseco-see.com.tr/fim/api',
        prodApi: 'https://sanalpos.teb.com.tr/fim/api',
    },
    denizbank: {
        name: 'Denizbank',
        test3D: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
        prod3D: 'https://denizbank.est.com.tr/fim/est3Dgate',
        testApi: 'https://entegrasyon.asseco-see.com.tr/fim/api',
        prodApi: 'https://denizbank.est.com.tr/fim/api',
    },
    ingbank: {
        name: 'ING Bank',
        test3D: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
        prod3D: 'https://sanalpos.ing.com.tr/fim/est3Dgate',
        testApi: 'https://entegrasyon.asseco-see.com.tr/fim/api',
        prodApi: 'https://sanalpos.ing.com.tr/fim/api',
    },
    sekerbank: {
        name: 'Şekerbank',
        test3D: 'https://entegrasyon.asseco-see.com.tr/fim/est3Dgate',
        prod3D: 'https://sanalpos.sekerbank.com.tr/fim/est3Dgate',
        testApi: 'https://entegrasyon.asseco-see.com.tr/fim/api',
        prodApi: 'https://sanalpos.sekerbank.com.tr/fim/api',
    },
    custom: {
        name: 'Özel',
        test3D: '',
        prod3D: '',
        testApi: '',
        prodApi: '',
    },
};

// ── Currency codes for NestPay ───────────────────────────────────
const CURRENCY_CODES = {
    TRY: '949', TL: '949',
    USD: '840',
    EUR: '978',
    GBP: '826',
};

class NestPayProvider {
    /**
     * @param {Object} config
     * @param {string} config.bankType - Bank key from BANK_GATEWAYS (e.g. 'ziraat')
     * @param {string} config.clientId - Merchant/İşyeri No
     * @param {string} config.storeKey - 3D Secure Key
     * @param {string} config.storeType - '3d_pay' | '3d' | '3d_pay_hosting'
     * @param {boolean} config.testMode
     * @param {string} [config.successUrl]
     * @param {string} [config.failUrl]
     * @param {string} [config.customGatewayUrl] - For custom bank type
     */
    constructor(config) {
        this.config = config;
        const bank = BANK_GATEWAYS[config.bankType] || BANK_GATEWAYS.custom;
        this.gatewayUrl = config.testMode
            ? (bank.test3D || config.customGatewayUrl)
            : (bank.prod3D || config.customGatewayUrl);
        this.apiUrl = config.testMode
            ? (bank.testApi || config.customApiUrl)
            : (bank.prodApi || config.customApiUrl);
    }

    /**
     * Generate NestPay 3D Secure hash (SHA-512)
     */
    _generateHash(params) {
        const { clientId, oid, amount, okUrl, failUrl, transactionType, installment, rnd, storeKey } = params;
        // NestPay hash formula: clientId|oid|amount|okUrl|failUrl|islemtipi|taksit|rnd||||||storeKey
        const hashStr = [
            clientId, oid, amount, okUrl, failUrl,
            transactionType, installment || '', rnd,
            '', '', '', '', '' // reserved fields
        ].join('|') + '|' + storeKey;

        return crypto.createHash('sha512').update(hashStr, 'utf8').digest('base64');
    }

    /**
     * Verify NestPay 3D callback hash
     */
    static verifyCallbackHash(params, storeKey) {
        const { HASHPARAMS, HASHPARAMSVAL, HASH } = params;
        if (!HASHPARAMS || !HASH) return false;

        // HASHPARAMS contains parameter names separated by ':'
        const paramNames = HASHPARAMS.split(':');
        let hashVal = '';
        for (const paramName of paramNames) {
            if (paramName && params[paramName]) {
                hashVal += params[paramName];
            }
        }
        hashVal += storeKey;

        const calculatedHash = crypto.createHash('sha512').update(hashVal, 'utf8').digest('base64');
        return calculatedHash === HASH;
    }

    /**
     * Initialize 3D Secure payment
     * Returns HTML form that auto-submits to bank's 3D gate
     */
    async initializePayment(params, tenantId) {
        const { clientId, storeKey, storeType } = this.config;
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
        const bankId = this.config.id || this.config.bankType;

        const oid = params.orderId || `ORD-${Date.now()}`;
        const amount = parseFloat(params.amount).toFixed(2);
        const currency = CURRENCY_CODES[params.currency] || CURRENCY_CODES.TRY;
        const installment = params.installment || '';
        const transactionType = 'Auth'; // Auth = Satış, PreAuth = Ön Provizyon
        const rnd = crypto.randomBytes(16).toString('hex');
        const lang = 'tr';

        const okUrl = this.config.successUrl || `${backendUrl}/api/payment/callback/nestpay?tenantId=${tenantId}&bankId=${bankId}&status=ok`;
        const failUrl = this.config.failUrl || `${backendUrl}/api/payment/callback/nestpay?tenantId=${tenantId}&bankId=${bankId}&status=fail`;
        const callbackUrl = `${backendUrl}/api/payment/callback/nestpay?tenantId=${tenantId}&bankId=${bankId}`;

        const hash = this._generateHash({
            clientId, oid, amount, okUrl, failUrl,
            transactionType, installment, rnd, storeKey
        });

        // Build auto-submit HTML form
        const formFields = {
            clientid: clientId,
            storetype: storeType || '3d_pay',
            hash: hash,
            islemtipi: transactionType,
            amount: amount,
            currency: currency,
            oid: oid,
            okUrl: okUrl,
            failUrl: failUrl,
            callbackUrl: callbackUrl,
            lang: lang,
            rnd: rnd,
            taksit: installment,
            hashAlgorithm: 'ver3',
            encoding: 'utf-8',
            // Cardholder info
            BillToName: params.user?.name || 'Müşteri',
            BillToCompany: '',
            email: params.user?.email || '',
            tel: params.user?.phone || '',
        };

        const formInputs = Object.entries(formFields)
            .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}" />`)
            .join('\n');

        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>3D Secure Ödeme</title>
    <style>
        body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; }
        .loader { text-align: center; }
        .spinner { border: 3px solid #e2e8f0; border-top: 3px solid #6366f1; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 16px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        p { color: #64748b; font-size: 14px; }
    </style>
</head>
<body>
    <div class="loader">
        <div class="spinner"></div>
        <p>Bankaya yönlendiriliyorsunuz...</p>
    </div>
    <form id="nestpay3d" method="POST" action="${this.gatewayUrl}">
        ${formInputs}
    </form>
    <script>document.getElementById('nestpay3d').submit();</script>
</body>
</html>`;

        return {
            success: true,
            html: html,
            redirectForm: true, // Indicates this is a full-page redirect, not an iframe
            raw: { oid, amount, currency, gateway: this.gatewayUrl }
        };
    }

    /**
     * Process XML API request (for non-3D operations like refund, void, etc.)
     */
    async xmlApiRequest(xmlBody) {
        try {
            const response = await axios.post(this.apiUrl, xmlBody, {
                headers: { 'Content-Type': 'application/xml; charset=utf-8' },
                timeout: 30000,
            });
            return response.data;
        } catch (error) {
            throw new Error('NestPay API hatası: ' + error.message);
        }
    }
}

NestPayProvider.BANK_GATEWAYS = BANK_GATEWAYS;
NestPayProvider.CURRENCY_CODES = CURRENCY_CODES;

module.exports = NestPayProvider;
