/**
 * UETDS (Ulaştırma Elektronik Takip ve Denetim Sistemi) Service
 *
 * Handles SOAP communication with the Turkish Ministry of Transport's
 * UNet web service for "Araca Tahsisli" (vehicle-assigned) transfer declarations.
 *
 * Key operations:
 *   - seferEkle     : Declare a new trip (sefer)
 *   - seferIptal    : Cancel a declared trip
 *   - yolcuEkle     : Add a passenger to a declared trip
 *   - yolcuIptal    : Cancel a passenger from a trip
 *   - personelEkle  : Add personnel (driver) to a trip
 *
 * Credentials are stored AES-256-CBC encrypted in PartnerProfile.uetdsUnetPasswordEnc.
 */

const crypto = require('crypto');
const axios = require('axios');
const env = require('../config/env');

const ENCRYPTION_KEY = env.security.uetdsEncryptionKey;
const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32), 'utf-8');
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
    if (!encryptedText) return null;
    const parts = encryptedText.split(':');
    if (parts.length < 2) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32), 'utf-8');
    const encryptedData = parts.slice(1).join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// ── Default UETDS SOAP endpoint ──────────────────────────────────────────────
// Tarifesiz Yolcu (D2 belgesi) servisi — UNet doğrudan erişim
const DEFAULT_SERVICE_URL = 'https://aracws.unetds.com/services/UetdsAracTahsisliService';

// ── XML Escaping ─────────────────────────────────────────────────────────────
function xmlEscape(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ── SOAP namespaces & SOAPAction values (from WSDL) ──────────────────────────
// WSDL: https://servis.turkiye.gov.tr/services/g2g/kdgm/uetdsarizi?wsdl
// Service: UdhbUetdsAriziService (Tarifesiz Yolcu / Arızı)
// targetNamespace: http://uetds.unetws.udhb.gov.tr/
const UETDS_NS = 'http://uetds.unetws.udhb.gov.tr/';

// SOAPAction URIs per WSDL binding (soap:operation soapAction="...")
const SOAP_ACTIONS = {
    seferEkle:       'http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/seferEkle',
    seferIptal:      'http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/seferIptal',
    yolcuEkle:       'http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/yolcuEkle',
    personelEkle:    'http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/personelEkle',
    kullaniciKontrol:'http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/kullaniciKontrol',
};

// ── Build SOAP envelope ──────────────────────────────────────────────────────
// The UETDS gateway requires WS-Security UsernameToken auth. Even though the
// body also carries <wsuser>, the gateway-level WS-Security must be present;
// without it the gateway responds with HTTP 401 "Authentication Required".
function buildSoapEnvelope(bodyXml, wsUsername, wsPassword) {
    const securityHeader = (wsUsername && wsPassword) ? `
        <wsse:Security
            xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
            <wsse:UsernameToken>
                <wsse:Username>${xmlEscape(wsUsername)}</wsse:Username>
                <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${xmlEscape(wsPassword)}</wsse:Password>
            </wsse:UsernameToken>
        </wsse:Security>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope 
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:uet="${UETDS_NS}">
    <soapenv:Header>${securityHeader}
    </soapenv:Header>
    <soapenv:Body>
        ${bodyXml}
    </soapenv:Body>
</soapenv:Envelope>`;
}

// ── SOAP call helper ─────────────────────────────────────────────────────────
async function callSoap(serviceUrl, soapAction, envelopeXml, basicAuth) {
    const url = serviceUrl || DEFAULT_SERVICE_URL;
    try {
        const headers = {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': soapAction,
        };
        // Also send HTTP Basic Auth — some UETDS gateways accept either WS-Security
        // or Basic Auth at the HTTP layer. Sending both is safe.
        if (basicAuth && basicAuth.username) {
            const token = Buffer.from(`${basicAuth.username}:${basicAuth.password || ''}`).toString('base64');
            headers['Authorization'] = `Basic ${token}`;
        }
        const response = await axios.post(url, envelopeXml, {
            headers,
            timeout: 30000,
            validateStatus: () => true, // Accept all HTTP status codes
        });
        const dataStr = typeof response.data === 'string'
            ? response.data
            : (response.data ? JSON.stringify(response.data) : '');
        console.log(`[UETDS SOAP] ${soapAction} -> HTTP ${response.status}, body length=${dataStr.length}`);
        if (response.status >= 400 || dataStr.length < 50) {
            console.log(`[UETDS SOAP] Response (first 1000 chars): ${dataStr.substring(0, 1000)}`);
        }
        return {
            success: response.status >= 200 && response.status < 300,
            status: response.status,
            data: response.data,
        };
    } catch (error) {
        console.error(`[UETDS SOAP] Network error for ${soapAction}:`, error.message);
        return {
            success: false,
            status: 0,
            data: null,
            error: error.message,
        };
    }
}

// ── Parse simple XML value by tag name ───────────────────────────────────────
function extractXmlValue(xml, tagName) {
    if (!xml) return null;
    const regex = new RegExp(`<[^:]*:?${tagName}[^>]*>([^<]*)<`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
}

function extractSoapFault(xml) {
    if (!xml) return null;
    const faultString = extractXmlValue(xml, 'faultstring');
    const detail = extractXmlValue(xml, 'detail') || extractXmlValue(xml, 'message');
    return faultString || detail || null;
}

// ── Format date for UETDS (dd.MM.yyyy HH:mm) ────────────────────────────────
// Smart: if already in "DD.MM.YYYY HH:mm" format, pass through unchanged.
// Otherwise parse as Date and format.
function formatUetdsDate(date) {
    if (!date) return '';
    // Already formatted string? (DD.MM.YYYY HH:mm)
    if (typeof date === 'string' && /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/.test(date.trim())) {
        return date.trim();
    }
    const d = new Date(date);
    if (isNaN(d.getTime())) {
        console.warn(`[UETDS] formatUetdsDate: geçersiz tarih değeri: ${date}`);
        return typeof date === 'string' ? date : '';
    }
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// UETDS Operations
// ═════════════════════════════════════════════════════════════════════════════

/**
 * seferEkle — Declare a new trip
 * @param {Object} credentials - { username, password, yetkiBelgeNo, serviceUrl }
 * @param {Object} sefer - Trip details
 *   { aracPlaka, seferAciklama, baslangicTarih, bitisTarih,
 *     baslangicIl, baslangicIlce, bitisIl, bitisIlce }
 */
async function seferEkle(credentials, sefer) {
    const bodyXml = `
        <uet:seferEkle>
            <uet:wsuser>
                <uet:kullaniciAdi>${xmlEscape(credentials.username)}</uet:kullaniciAdi>
                <uet:sifre>${xmlEscape(credentials.password)}</uet:sifre>
            </uet:wsuser>
            <uet:seferBilgileri>
                <uet:aracPlaka>${xmlEscape(sefer.aracPlaka)}</uet:aracPlaka>
                <uet:seferAciklama>${xmlEscape(sefer.seferAciklama || '')}</uet:seferAciklama>
                <uet:yetkiBelgeNo>${xmlEscape(credentials.yetkiBelgeNo)}</uet:yetkiBelgeNo>
                <uet:baslangicTarih>${formatUetdsDate(sefer.baslangicTarih)}</uet:baslangicTarih>
                <uet:bitisTarih>${formatUetdsDate(sefer.bitisTarih)}</uet:bitisTarih>
                <uet:baslangicIl>${xmlEscape(sefer.baslangicIl || '')}</uet:baslangicIl>
                <uet:baslangicIlce>${xmlEscape(sefer.baslangicIlce || '')}</uet:baslangicIlce>
                <uet:bitisIl>${xmlEscape(sefer.bitisIl || '')}</uet:bitisIl>
                <uet:bitisIlce>${xmlEscape(sefer.bitisIlce || '')}</uet:bitisIlce>
            </uet:seferBilgileri>
        </uet:seferEkle>`;

    const envelope = buildSoapEnvelope(bodyXml, credentials.username, credentials.password);
    const result = await callSoap(credentials.serviceUrl, SOAP_ACTIONS.seferEkle, envelope, { username: credentials.username, password: credentials.password });

    const uetdsSeferId = extractXmlValue(result.data, 'uetdsSeferId') || extractXmlValue(result.data, 'seferId');
    const refNo = extractXmlValue(result.data, 'referansNo') || extractXmlValue(result.data, 'sonucKodu');
    const hataMsg = extractSoapFault(result.data)
        || extractXmlValue(result.data, 'sonucMesaji')
        || extractXmlValue(result.data, 'hataAciklamasi')
        || result.error
        || (result.status && result.status >= 400 ? `HTTP ${result.status}` : null)
        || (!result.data ? 'Sunucudan boş yanıt alındı' : null);

    // Build rawResponse: prefer actual data, fall back to error message
    let rawResponse;
    if (result.data) {
        rawResponse = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
    } else {
        rawResponse = result.error || 'Sunucudan yanıt alınamadı (data=null)';
    }

    return {
        success: result.success && !!uetdsSeferId,
        uetdsSeferId,
        refNo,
        status: result.status,
        errorMessage: !uetdsSeferId ? (hataMsg || 'Bilinmeyen hata') : null,
        rawRequest: envelope,
        rawResponse,
    };
}

/**
 * seferIptal — Cancel a declared trip
 */
async function seferIptal(credentials, uetdsSeferId) {
    const bodyXml = `
        <uet:seferIptal>
            <uet:wsuser>
                <uet:kullaniciAdi>${xmlEscape(credentials.username)}</uet:kullaniciAdi>
                <uet:sifre>${xmlEscape(credentials.password)}</uet:sifre>
            </uet:wsuser>
            <uet:uetdsSeferId>${xmlEscape(uetdsSeferId)}</uet:uetdsSeferId>
        </uet:seferIptal>`;

    const envelope = buildSoapEnvelope(bodyXml, credentials.username, credentials.password);
    const result = await callSoap(credentials.serviceUrl, SOAP_ACTIONS.seferIptal, envelope, { username: credentials.username, password: credentials.password });
    const hata = extractSoapFault(result.data) || extractXmlValue(result.data, 'sonucMesaji');

    return {
        success: result.success,
        errorMessage: !result.success ? hata : null,
        rawRequest: envelope,
        rawResponse: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
    };
}

/**
 * yolcuEkle — Add a passenger to a declared trip
 * @param {Object} yolcu - { tcKimlikNo, adi, soyadi, cinsiyet, telefon, uyruk }
 */
async function yolcuEkle(credentials, uetdsSeferId, yolcu) {
    const bodyXml = `
        <uet:yolcuEkle>
            <uet:wsuser>
                <uet:kullaniciAdi>${xmlEscape(credentials.username)}</uet:kullaniciAdi>
                <uet:sifre>${xmlEscape(credentials.password)}</uet:sifre>
            </uet:wsuser>
            <uet:uetdsSeferId>${xmlEscape(uetdsSeferId)}</uet:uetdsSeferId>
            <uet:yolcuBilgileri>
                <uet:tcKimlikNo>${xmlEscape(yolcu.tcKimlikNo || '')}</uet:tcKimlikNo>
                <uet:adi>${xmlEscape(yolcu.adi)}</uet:adi>
                <uet:soyadi>${xmlEscape(yolcu.soyadi)}</uet:soyadi>
                <uet:cinsiyet>${xmlEscape(yolcu.cinsiyet || '1')}</uet:cinsiyet>
                <uet:uyruk>${xmlEscape(yolcu.uyruk || 'TC')}</uet:uyruk>
                <uet:telefonNo>${xmlEscape(yolcu.telefon || '')}</uet:telefonNo>
            </uet:yolcuBilgileri>
        </uet:yolcuEkle>`;

    const envelope = buildSoapEnvelope(bodyXml, credentials.username, credentials.password);
    const result = await callSoap(credentials.serviceUrl, SOAP_ACTIONS.yolcuEkle, envelope, { username: credentials.username, password: credentials.password });
    const hata = extractSoapFault(result.data) || extractXmlValue(result.data, 'sonucMesaji');

    return {
        success: result.success,
        errorMessage: !result.success ? hata : null,
        rawRequest: envelope,
        rawResponse: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
    };
}

/**
 * personelEkle — Add driver/personnel to a trip
 * @param {Object} personel - { tcKimlikNo, adi, soyadi, cinsiyet, telefonNo, gorevTuru }
 */
async function personelEkle(credentials, uetdsSeferId, personel) {
    const bodyXml = `
        <uet:personelEkle>
            <uet:wsuser>
                <uet:kullaniciAdi>${xmlEscape(credentials.username)}</uet:kullaniciAdi>
                <uet:sifre>${xmlEscape(credentials.password)}</uet:sifre>
            </uet:wsuser>
            <uet:uetdsSeferId>${xmlEscape(uetdsSeferId)}</uet:uetdsSeferId>
            <uet:personelBilgileri>
                <uet:tcKimlikNo>${xmlEscape(personel.tcKimlikNo)}</uet:tcKimlikNo>
                <uet:adi>${xmlEscape(personel.adi)}</uet:adi>
                <uet:soyadi>${xmlEscape(personel.soyadi)}</uet:soyadi>
                <uet:cinsiyet>${xmlEscape(personel.cinsiyet || '1')}</uet:cinsiyet>
                <uet:telefonNo>${xmlEscape(personel.telefonNo || '')}</uet:telefonNo>
                <uet:gorevTuru>${xmlEscape(personel.gorevTuru || '1')}</uet:gorevTuru>
            </uet:personelBilgileri>
        </uet:personelEkle>`;

    const envelope = buildSoapEnvelope(bodyXml, credentials.username, credentials.password);
    const result = await callSoap(credentials.serviceUrl, SOAP_ACTIONS.personelEkle, envelope, { username: credentials.username, password: credentials.password });
    const hata = extractSoapFault(result.data) || extractXmlValue(result.data, 'sonucMesaji');

    return {
        success: result.success,
        errorMessage: !result.success ? hata : null,
        rawRequest: envelope,
        rawResponse: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
    };
}

/**
 * Test UETDS credentials using the kullaniciKontrol operation from WSDL.
 * This is a dedicated auth check — much more reliable than sending a dummy seferEkle.
 */
async function testCredentials(credentials) {
    console.log(`[UETDS SOAP] testCredentials: username=${credentials.username}, serviceUrl=${credentials.serviceUrl || DEFAULT_SERVICE_URL}`);
    
    // Use kullaniciKontrol — the WSDL-defined operation for credential verification
    const bodyXml = `
        <uet:kullaniciKontrol>
            <uet:wsuser>
                <uet:kullaniciAdi>${xmlEscape(credentials.username)}</uet:kullaniciAdi>
                <uet:sifre>${xmlEscape(credentials.password)}</uet:sifre>
            </uet:wsuser>
        </uet:kullaniciKontrol>`;

    const envelope = buildSoapEnvelope(bodyXml, credentials.username, credentials.password);
    const result = await callSoap(credentials.serviceUrl, SOAP_ACTIONS.kullaniciKontrol, envelope, { username: credentials.username, password: credentials.password });

    console.log(`[UETDS SOAP] testCredentials response: status=${result.status}, success=${result.success}, error=${result.error || 'none'}`);
    if (result.data) {
        const rawStr = typeof result.data === 'string' ? result.data.substring(0, 500) : JSON.stringify(result.data).substring(0, 500);
        console.log(`[UETDS SOAP] testCredentials response body (first 500 chars): ${rawStr}`);
    }

    // Network / connection error
    if (!result.data && result.error) {
        return { success: false, error: `Bağlantı hatası: ${result.error}` };
    }

    const raw = typeof result.data === 'string' ? result.data : '';

    // Check for WS-Security / auth failures at the gateway level
    const isAuthError = raw.includes('InvalidSecurity') || raw.includes('InvalidSecurityToken') ||
        raw.includes('FailedAuthentication') || raw.includes('wsse:FailedCheck') ||
        raw.includes('Authentication') || raw.includes('Unauthorized');

    if (isAuthError) {
        return { success: false, error: 'Kullanıcı adı veya şifre hatalı (WS-Security)' };
    }

    // HTTP 500 with generic "Client Error" usually means wrong namespace/SOAPAction
    if (result.status === 500) {
        const fault = extractSoapFault(result.data);
        return { success: false, error: `Sunucu hatası: ${fault || 'HTTP 500'}` };
    }

    // If we get an HTTP 200 response, the credentials are valid
    // (even if the SOAP body contains a business error like "kullanıcı bulunamadı",
    //  that means the gateway accepted the auth and forwarded to the backend)
    if (result.success) {
        // Check for explicit success indicators
        const sonucKodu = extractXmlValue(result.data, 'sonucKodu');
        const sonucMesaji = extractXmlValue(result.data, 'sonucMesaji');
        
        if (sonucKodu === '0' || sonucKodu === '1' || raw.includes('BASARILI')) {
            return { success: true, message: 'Bağlantı başarılı — kimlik doğrulandı' };
        }
        
        // Even a validation error at HTTP 200 means auth passed
        if (sonucMesaji) {
            // Check if message indicates auth failure at the business logic level
            if (sonucMesaji.toLowerCase().includes('kullanıcı') && sonucMesaji.toLowerCase().includes('hatalı')) {
                return { success: false, error: `Kullanıcı adı veya şifre hatalı: ${sonucMesaji}` };
            }
            return { success: true, message: `Bağlantı başarılı — ${sonucMesaji}` };
        }

        // Got a 200 response with a SOAP envelope — auth is working
        if (raw.includes('Envelope')) {
            return { success: true, message: 'Bağlantı başarılı — kimlik doğrulandı' };
        }
    }

    // Fallback
    return {
        success: false,
        error: extractSoapFault(result.data) || result.error || 'Bağlantı kurulamadı — Sunucu yanıt vermedi',
    };
}

module.exports = {
    encrypt,
    decrypt,
    seferEkle,
    seferIptal,
    yolcuEkle,
    personelEkle,
    testCredentials,
    DEFAULT_SERVICE_URL,
};
