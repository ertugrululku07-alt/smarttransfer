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
// targetNamespace: http://uetds.unetws.udhb.gov.tr/
const UETDS_NS = 'http://uetds.unetws.udhb.gov.tr/';

const SOAP_ACTIONS = {
    seferEkle:       'http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/seferEkle',
    seferIptal:      'http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/seferIptal',
    yolcuEkle:       'http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/yolcuEkle',
    personelEkle:    'http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/personelEkle',
    kullaniciKontrol:'http://uetds.unetws.udhb.gov.tr/uetdsytsarizi/kullaniciKontrol',
};

// ── Build SOAP envelope ──────────────────────────────────────────────────────
function buildSoapEnvelope(bodyXml) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope 
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:uet="${UETDS_NS}">
    <soapenv:Header/>
    <soapenv:Body>
        ${bodyXml}
    </soapenv:Body>
</soapenv:Envelope>`;
}

// ── SOAP call helper with retry ──────────────────────────────────────────────
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function callSoap(serviceUrl, soapAction, envelopeXml, basicAuth) {
    const url = serviceUrl || DEFAULT_SERVICE_URL;
    const headers = {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': `"${soapAction}"`,
    };
    // UETDS requires HTTP Basic Authentication in addition to body-level wsuser
    // See: UETDS Teknik Doküman Bölüm E — SoapUI Authorization: Basic
    if (basicAuth && basicAuth.username && basicAuth.password) {
        const token = Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString('base64');
        headers['Authorization'] = `Basic ${token}`;
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await axios.post(url, envelopeXml, {
                headers,
                timeout: 60000,
                validateStatus: () => true,
                // Force HTTP/1.1 keep-alive and prevent premature socket close
                httpAgent: new (require('http').Agent)({ keepAlive: true }),
                httpsAgent: new (require('https').Agent)({ keepAlive: true, rejectUnauthorized: true }),
            });
            const dataStr = typeof response.data === 'string'
                ? response.data
                : (response.data ? JSON.stringify(response.data) : '');
            console.log(`[UETDS SOAP] ${soapAction} -> HTTP ${response.status}, body length=${dataStr.length} (attempt ${attempt})`);
            if (response.status >= 400 || dataStr.length < 50) {
                console.log(`[UETDS SOAP] Response (first 1000 chars): ${dataStr.substring(0, 1000)}`);
            }
            return {
                success: response.status >= 200 && response.status < 300,
                status: response.status,
                data: response.data,
            };
        } catch (error) {
            const isRetryable = error.code === 'ECONNRESET' || error.code === 'ECONNABORTED' ||
                error.code === 'ETIMEDOUT' || error.code === 'EPIPE' || error.code === 'EAI_AGAIN' ||
                error.message.includes('ECONNRESET') || error.message.includes('socket hang up');

            console.error(`[UETDS SOAP] Network error for ${soapAction} (attempt ${attempt}/${MAX_RETRIES}): ${error.message}`);

            if (isRetryable && attempt < MAX_RETRIES) {
                console.log(`[UETDS SOAP] Retrying in ${RETRY_DELAY_MS}ms...`);
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
                continue;
            }

            return {
                success: false,
                status: 0,
                data: null,
                error: error.message,
            };
        }
    }
}

// ── Parse simple XML value by tag name ───────────────────────────────────────
// Matches <tagName>, <ns:tagName>, with optional attributes; namespace-agnostic.
function extractXmlValue(xml, tagName) {
    if (!xml || typeof xml !== 'string') return null;
    const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
        `<(?:[\\w-]+:)?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${escaped}>`,
        'i'
    );
    const match = xml.match(regex);
    return match ? match[1].trim() : null;
}

function extractSoapFault(xml) {
    if (!xml) return null;
    const faultString = extractXmlValue(xml, 'faultstring');
    const detail = extractXmlValue(xml, 'detail') || extractXmlValue(xml, 'message');
    return faultString || detail || null;
}

// ── Date helpers for UETDS xs:dateTime + xs:string (HH:mm) ──────────────────
// WSDL uses xs:dateTime for tarih fields and xs:string for saat fields.
// Example: hareketTarihi=2026-05-27T09:00:00, hareketSaati=09:00
function asDateObj(date) {
    if (!date) return null;
    if (date instanceof Date) return isNaN(date.getTime()) ? null : date;
    const d = new Date(date);
    return isNaN(d.getTime()) ? null : d;
}
function toIsoDateTime(date) {
    const d = asDateObj(date);
    if (!d) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function toHHmm(date) {
    const d = asDateObj(date);
    if (!d) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// UETDS Operations
// ═════════════════════════════════════════════════════════════════════════════

/**
 * seferEkle — Declare a new ad-hoc (arızı) trip per WSDL schema.
 * Required schema:
 *   <seferEkle>
 *     <wsuser>{kullaniciAdi, sifre}</wsuser>
 *     <ariziSeferBilgileriInput>
 *       <aracPlaka/>                 (required)
 *       <seferAciklama/>             (optional)
 *       <hareketTarihi/>             (xs:dateTime — ISO format)
 *       <hareketSaati/>              (HH:mm)
 *       <aracTelefonu/>              (optional)
 *       <firmaSeferNo/>              (required — our booking number / runKey)
 *       <seferBitisTarihi/>          (xs:dateTime)
 *       <seferBitisSaati/>           (HH:mm)
 *     </ariziSeferBilgileriInput>
 *   </seferEkle>
 * @param {Object} sefer - { aracPlaka, seferAciklama, baslangicTarih, bitisTarih,
 *                            firmaSeferNo, aracTelefonu? }
 */
async function seferEkle(credentials, sefer) {
    const bodyXml = `
        <uet:seferEkle>
            <uet:wsuser>
                <uet:kullaniciAdi>${xmlEscape(credentials.username)}</uet:kullaniciAdi>
                <uet:sifre>${xmlEscape(credentials.password)}</uet:sifre>
            </uet:wsuser>
            <uet:ariziSeferBilgileriInput>
                <uet:aracPlaka>${xmlEscape(sefer.aracPlaka)}</uet:aracPlaka>
                <uet:seferAciklama>${xmlEscape(sefer.seferAciklama || '')}</uet:seferAciklama>
                <uet:hareketTarihi>${toIsoDateTime(sefer.baslangicTarih)}</uet:hareketTarihi>
                <uet:hareketSaati>${toHHmm(sefer.baslangicTarih)}</uet:hareketSaati>
                <uet:aracTelefonu>${xmlEscape(sefer.aracTelefonu || '')}</uet:aracTelefonu>
                <uet:firmaSeferNo>${xmlEscape(sefer.firmaSeferNo || '')}</uet:firmaSeferNo>
                <uet:seferBitisTarihi>${toIsoDateTime(sefer.bitisTarih)}</uet:seferBitisTarihi>
                <uet:seferBitisSaati>${toHHmm(sefer.bitisTarih)}</uet:seferBitisSaati>
            </uet:ariziSeferBilgileriInput>
        </uet:seferEkle>`;

    const envelope = buildSoapEnvelope(bodyXml);
    const result = await callSoap(credentials.serviceUrl, SOAP_ACTIONS.seferEkle, envelope, { username: credentials.username, password: credentials.password });

    // WSDL response field is uetdsSeferReferansNo (a long), not uetdsSeferId.
    const uetdsSeferId = extractXmlValue(result.data, 'uetdsSeferReferansNo');
    const sonucKodu = extractXmlValue(result.data, 'sonucKodu');
    const sonucMesaji = extractXmlValue(result.data, 'sonucMesaji');
    const refNo = uetdsSeferId || sonucKodu;
    // UETDS convention: sonucKodu="0" means success, anything else (e.g. "1") is an error.
    const businessError = (sonucKodu && sonucKodu !== '0') ? sonucMesaji : null;
    const hataMsg = extractSoapFault(result.data)
        || businessError
        || sonucMesaji
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
 * seferIptal — Cancel a declared trip per WSDL schema.
 *   <seferIptal>
 *     <wsuser/>
 *     <uetdsSeferReferansNo/>  (long — the trip ref returned by seferEkle)
 *     <iptalAciklama/>
 *   </seferIptal>
 */
async function seferIptal(credentials, uetdsSeferReferansNo, iptalAciklama = 'İptal') {
    const bodyXml = `
        <uet:seferIptal>
            <uet:wsuser>
                <uet:kullaniciAdi>${xmlEscape(credentials.username)}</uet:kullaniciAdi>
                <uet:sifre>${xmlEscape(credentials.password)}</uet:sifre>
            </uet:wsuser>
            <uet:uetdsSeferReferansNo>${xmlEscape(uetdsSeferReferansNo)}</uet:uetdsSeferReferansNo>
            <uet:iptalAciklama>${xmlEscape(iptalAciklama)}</uet:iptalAciklama>
        </uet:seferIptal>`;

    const envelope = buildSoapEnvelope(bodyXml);
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
 * yolcuEkle — Add a passenger to a declared trip per WSDL schema.
 *   <yolcuEkle>
 *     <wsuser/>
 *     <uetdsSeferReferansNo/>
 *     <seferYolcuBilgileriInput>
 *       <uyrukUlke/>            (required, e.g. "TR")
 *       <tcKimlikPasaportNo/>   (required)
 *       <cinsiyet/>             (optional, "E"/"K")
 *       <adi/>                  (required)
 *       <soyadi/>               (required)
 *       <koltukNo/>             (required string)
 *       <telefonNo/>            (optional)
 *       <grupId/>               (required long — 0 for ungrouped ad-hoc)
 *       <hesKodu/>              (optional)
 *     </seferYolcuBilgileriInput>
 *   </yolcuEkle>
 * @param {Object} yolcu - { tcKimlikPasaportNo, adi, soyadi, cinsiyet?, telefon?, uyrukUlke?, koltukNo?, grupId?, hesKodu? }
 */
async function yolcuEkle(credentials, uetdsSeferReferansNo, yolcu) {
    const bodyXml = `
        <uet:yolcuEkle>
            <uet:wsuser>
                <uet:kullaniciAdi>${xmlEscape(credentials.username)}</uet:kullaniciAdi>
                <uet:sifre>${xmlEscape(credentials.password)}</uet:sifre>
            </uet:wsuser>
            <uet:uetdsSeferReferansNo>${xmlEscape(uetdsSeferReferansNo)}</uet:uetdsSeferReferansNo>
            <uet:seferYolcuBilgileriInput>
                <uet:uyrukUlke>${xmlEscape(yolcu.uyrukUlke || yolcu.uyruk || 'TR')}</uet:uyrukUlke>
                <uet:tcKimlikPasaportNo>${xmlEscape(yolcu.tcKimlikPasaportNo || yolcu.tcKimlikNo || '')}</uet:tcKimlikPasaportNo>
                <uet:cinsiyet>${xmlEscape(yolcu.cinsiyet || 'E')}</uet:cinsiyet>
                <uet:adi>${xmlEscape(yolcu.adi)}</uet:adi>
                <uet:soyadi>${xmlEscape(yolcu.soyadi)}</uet:soyadi>
                <uet:koltukNo>${xmlEscape(yolcu.koltukNo || '1')}</uet:koltukNo>
                <uet:telefonNo>${xmlEscape(yolcu.telefon || yolcu.telefonNo || '')}</uet:telefonNo>
                <uet:grupId>${xmlEscape(yolcu.grupId || '0')}</uet:grupId>
                <uet:hesKodu>${xmlEscape(yolcu.hesKodu || '')}</uet:hesKodu>
            </uet:seferYolcuBilgileriInput>
        </uet:yolcuEkle>`;

    const envelope = buildSoapEnvelope(bodyXml);
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
 * personelEkle — Add driver/personnel to a trip per WSDL schema.
 *   <personelEkle>
 *     <wsuser/>
 *     <uetdsSeferReferansNo/>
 *     <seferPersonelBilgileriInput>
 *       <turKodu/>              (int: 1=şoför, 2=muavin, 3=hostes, …)
 *       <uyrukUlke/>            (required)
 *       <tcKimlikPasaportNo/>   (required)
 *       <cinsiyet/>             (required, "E"/"K")
 *       <adi/>                  (required)
 *       <soyadi/>               (required)
 *       <telefon/>              (optional)
 *       <adres/>                (optional)
 *       <hesKodu/>              (optional)
 *     </seferPersonelBilgileriInput>
 *   </personelEkle>
 * @param {Object} personel - { tcKimlikPasaportNo, adi, soyadi, cinsiyet, telefon?, adres?, hesKodu?, turKodu?, uyrukUlke? }
 */
async function personelEkle(credentials, uetdsSeferReferansNo, personel) {
    const bodyXml = `
        <uet:personelEkle>
            <uet:wsuser>
                <uet:kullaniciAdi>${xmlEscape(credentials.username)}</uet:kullaniciAdi>
                <uet:sifre>${xmlEscape(credentials.password)}</uet:sifre>
            </uet:wsuser>
            <uet:uetdsSeferReferansNo>${xmlEscape(uetdsSeferReferansNo)}</uet:uetdsSeferReferansNo>
            <uet:seferPersonelBilgileriInput>
                <uet:turKodu>${xmlEscape(personel.turKodu || personel.gorevTuru || '1')}</uet:turKodu>
                <uet:uyrukUlke>${xmlEscape(personel.uyrukUlke || 'TR')}</uet:uyrukUlke>
                <uet:tcKimlikPasaportNo>${xmlEscape(personel.tcKimlikPasaportNo || personel.tcKimlikNo || '')}</uet:tcKimlikPasaportNo>
                <uet:cinsiyet>${xmlEscape(personel.cinsiyet || 'E')}</uet:cinsiyet>
                <uet:adi>${xmlEscape(personel.adi)}</uet:adi>
                <uet:soyadi>${xmlEscape(personel.soyadi)}</uet:soyadi>
                <uet:telefon>${xmlEscape(personel.telefon || personel.telefonNo || '')}</uet:telefon>
                <uet:adres>${xmlEscape(personel.adres || '')}</uet:adres>
                <uet:hesKodu>${xmlEscape(personel.hesKodu || '')}</uet:hesKodu>
            </uet:seferPersonelBilgileriInput>
        </uet:personelEkle>`;

    const envelope = buildSoapEnvelope(bodyXml);
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
 * Test UETDS credentials by calling kullaniciKontrol on the arizi service.
 *
 * The arizi (tarifesiz) service endpoint only supports its own operations.
 * kullaniciKontrol authenticates the user; however, on the arizi endpoint it
 * may return "Eksik Parametre" (sonucKodu=1) even when credentials are VALID
 * because the operation expects additional context that a bare auth check
 * doesn't provide. The critical distinction:
 *   • Response contains "KULLANICI ADI YADA SIFRE HATALI" → credentials INVALID
 *   • Response contains "Eksik Parametre" → credentials VALID (auth passed,
 *     operation just needs more params we don't provide for a test)
 *   • sonucKodu=0 → credentials valid (ideal case)
 *   • HTTP 500 "Yetki Hatası" → IP not whitelisted
 */
async function testCredentials(credentials) {
    console.log(`[UETDS SOAP] testCredentials: username=${credentials.username}, serviceUrl=${credentials.serviceUrl || DEFAULT_SERVICE_URL}`);

    const bodyXml = `
        <uet:kullaniciKontrol>
            <uet:wsuser>
                <uet:kullaniciAdi>${xmlEscape(credentials.username)}</uet:kullaniciAdi>
                <uet:sifre>${xmlEscape(credentials.password)}</uet:sifre>
            </uet:wsuser>
        </uet:kullaniciKontrol>`;

    const envelope = buildSoapEnvelope(bodyXml);
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
        raw.includes('FailedAuthentication') || raw.includes('wsse:FailedCheck');

    if (isAuthError) {
        return { success: false, error: 'Kullanıcı adı veya şifre hatalı (WS-Security)' };
    }

    // HTTP 500 with generic fault — check if it's an IP/auth issue
    if (result.status === 500) {
        const fault = extractSoapFault(result.data);
        if (fault && (fault.includes('Yetki') || fault.includes('yetki'))) {
            return { success: false, error: 'IP adresi yetkilendirilmemiş — U-NET portalından IP tanımlayın' };
        }
        return { success: false, error: `Sunucu hatası: ${fault || 'HTTP 500'}` };
    }

    // Parse response body
    const sonucKodu = extractXmlValue(raw, 'sonucKodu');
    const sonucMesaji = (extractXmlValue(raw, 'sonucMesaji') || '').trim();

    console.log(`[UETDS SOAP] testCredentials parsed: sonucKodu=${sonucKodu}, sonucMesaji=${sonucMesaji}`);

    // sonucKodu=0 → success
    if (sonucKodu === '0') {
        return { success: true, message: 'Bağlantı başarılı — kimlik doğrulandı' };
    }

    // Credential error → definite failure
    if (sonucMesaji.includes('KULLANICI') || sonucMesaji.includes('SIFRE') || sonucMesaji.includes('kullanici') || sonucMesaji.includes('sifre')) {
        return { success: false, error: sonucMesaji };
    }

    // "Eksik Parametre" → auth SUCCEEDED but operation needs more params.
    // This means credentials are VALID.
    if (sonucMesaji.includes('Eksik') || sonucMesaji.includes('eksik') || sonucMesaji.includes('Parametre') || sonucMesaji.includes('parametre')) {
        return { success: true, message: 'Bağlantı başarılı — kimlik doğrulandı' };
    }

    // Any other non-zero sonucKodu with a message
    if (sonucMesaji) {
        // If we got a response with a business message but no auth error, auth passed
        return { success: true, message: `Bağlantı başarılı — ${sonucMesaji}` };
    }

    // If we got a 200 response at all, the gateway authenticated us
    if (result.success || result.status === 200) {
        return { success: true, message: 'Bağlantı başarılı — kimlik doğrulandı' };
    }

    // Fallback
    return {
        success: false,
        error: extractSoapFault(raw) || result.error || 'Bağlantı kurulamadı — Sunucu yanıt vermedi',
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
