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

// ── Build SOAP envelope with WS-Security ─────────────────────────────────────
function buildSoapEnvelope(username, password, bodyXml) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope 
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:uet="http://uetds.udhb.gov.tr/">
    <soapenv:Header>
        <wsse:Security 
            xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
            soapenv:mustUnderstand="1">
            <wsse:UsernameToken>
                <wsse:Username>${xmlEscape(username)}</wsse:Username>
                <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${xmlEscape(password)}</wsse:Password>
            </wsse:UsernameToken>
        </wsse:Security>
    </soapenv:Header>
    <soapenv:Body>
        ${bodyXml}
    </soapenv:Body>
</soapenv:Envelope>`;
}

// ── SOAP call helper ─────────────────────────────────────────────────────────
async function callSoap(serviceUrl, soapAction, envelopeXml) {
    const url = serviceUrl || DEFAULT_SERVICE_URL;
    try {
        const response = await axios.post(url, envelopeXml, {
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': soapAction,
            },
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

    const envelope = buildSoapEnvelope(credentials.username, credentials.password, bodyXml);
    const result = await callSoap(credentials.serviceUrl, 'seferEkle', envelope);

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

    const envelope = buildSoapEnvelope(credentials.username, credentials.password, bodyXml);
    const result = await callSoap(credentials.serviceUrl, 'seferIptal', envelope);
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

    const envelope = buildSoapEnvelope(credentials.username, credentials.password, bodyXml);
    const result = await callSoap(credentials.serviceUrl, 'yolcuEkle', envelope);
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

    const envelope = buildSoapEnvelope(credentials.username, credentials.password, bodyXml);
    const result = await callSoap(credentials.serviceUrl, 'personelEkle', envelope);
    const hata = extractSoapFault(result.data) || extractXmlValue(result.data, 'sonucMesaji');

    return {
        success: result.success,
        errorMessage: !result.success ? hata : null,
        rawRequest: envelope,
        rawResponse: typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
    };
}

/**
 * Test UNet credentials by making a lightweight seferEkle call
 * (we intentionally send an incomplete sefer to see if auth works;
 *  a 'BASARILI' or auth-specific error reveals credential validity)
 */
async function testCredentials(credentials) {
    console.log(`[UETDS SOAP] testCredentials: username=${credentials.username}, serviceUrl=${credentials.serviceUrl || DEFAULT_SERVICE_URL}`);
    
    const bodyXml = `
        <uet:seferEkle>
            <uet:wsuser>
                <uet:kullaniciAdi>${xmlEscape(credentials.username)}</uet:kullaniciAdi>
                <uet:sifre>${xmlEscape(credentials.password)}</uet:sifre>
            </uet:wsuser>
            <uet:seferBilgileri>
                <uet:aracPlaka>TEST</uet:aracPlaka>
                <uet:yetkiBelgeNo>${xmlEscape(credentials.yetkiBelgeNo)}</uet:yetkiBelgeNo>
                <uet:baslangicTarih>01.01.2099 00:00</uet:baslangicTarih>
                <uet:bitisTarih>01.01.2099 01:00</uet:bitisTarih>
            </uet:seferBilgileri>
        </uet:seferEkle>`;

    const envelope = buildSoapEnvelope(credentials.username, credentials.password, bodyXml);
    const result = await callSoap(credentials.serviceUrl, 'seferEkle', envelope);

    console.log(`[UETDS SOAP] testCredentials response: status=${result.status}, success=${result.success}, error=${result.error || 'none'}`);
    if (result.data) {
        const rawStr = typeof result.data === 'string' ? result.data.substring(0, 500) : JSON.stringify(result.data).substring(0, 500);
        console.log(`[UETDS SOAP] testCredentials response body (first 500 chars): ${rawStr}`);
    }

    // Check for auth failures
    const raw = typeof result.data === 'string' ? result.data : '';
    const isAuthError = raw.includes('Authentication') || raw.includes('Unauthorized') ||
        raw.includes('InvalidSecurity') || raw.includes('Kimlik doğrulama') ||
        raw.includes('InvalidSecurityToken') || raw.includes('FailedAuthentication') ||
        raw.includes('Security header') || raw.includes('wsse:FailedCheck');

    if (isAuthError) {
        return { success: false, error: 'Kullanıcı adı veya şifre hatalı' };
    }

    // If we get a field validation error or any non-auth SOAP response, auth passed!
    const isValidationError = raw.includes('zorunlu') || raw.includes('hatalı') ||
        raw.includes('plaka') || raw.includes('BASARISIZ') || raw.includes('Fault') ||
        raw.includes('sonucKodu') || raw.includes('sonucMesaji') || raw.includes('Envelope');

    if (result.success || isValidationError) {
        return { success: true, message: 'Bağlantı başarılı — kimlik doğrulandı' };
    }

    // Connection error (network, timeout, etc.)
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
