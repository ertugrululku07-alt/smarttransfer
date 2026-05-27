const axios = require('axios');
const FormData = require('form-data');

class UetdsRestService {
    constructor() {
        this.baseUrl = 'https://api.uetds.net';
    }

    /**
     * Send POST request with multipart/form-data payload
     */
    async _post(endpoint, data) {
        const formData = new FormData();
        for (const key in data) {
            if (data[key] !== undefined && data[key] !== null) {
                if (Array.isArray(data[key])) {
                    // form data requires array fields to be appended multiple times with the same key
                    // e.g., yolcu_uyruk[]: TR, yolcu_uyruk[]: EN
                    data[key].forEach(val => {
                        formData.append(key, val);
                    });
                } else {
                    formData.append(key, data[key]);
                }
            }
        }

        try {
            const response = await axios.post(`${this.baseUrl}${endpoint}`, formData, {
                headers: formData.getHeaders()
            });
            return response.data;
        } catch (error) {
            console.error(`UETDS Rest API Error (${endpoint}):`, error.response?.data || error.message);
            throw new Error(`UETDS Servis Hatası (${endpoint}): ${error.message}`);
        }
    }

    /**
     * Get Authentication Token
     * Returns a 15-character token or throws an error.
     */
    async giris({ kod, email, parola }) {
        console.log(`[UETDS.net] giris attempt: kod=${kod}, email=${email}, parola=${parola ? '***' : 'EMPTY'}`);
        const responseText = await this._post('/giris', { kod, email, parola });
        console.log(`[UETDS.net] giris response: "${responseText}" (length=${String(responseText).trim().length})`);
        const token = String(responseText).trim();
        if (token.length !== 15) {
            throw new Error(`Geçersiz kullanıcı bilgileri veya hatalı yanıt (Jeton alınamadı). API yanıtı: "${token}"`);
        }
        return token;
    }

    /**
     * Test Credentials (Helper for Admin Dashboard)
     */
    async testCredentials({ firmaKodu, username, password }) {
        try {
            const token = await this.giris({ kod: firmaKodu, email: username, parola: password });
            return {
                success: true,
                message: 'UETDS.net Bağlantı Testi Başarılı.',
                details: { tokenPrefix: token.substring(0, 5) + '...' }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Bağlantı başarısız',
                details: {}
            };
        }
    }

    /**
     * Get vehicles list
     */
    async araclar({ kod, jeton }) {
        const data = await this._post('/araclar', { kod, jeton });
        // Expected format: [{"id":"1","plaka":"34TEST34"}, ...]
        return Array.isArray(data) ? data : [];
    }

    /**
     * Get personnel list
     */
    async personel({ kod, jeton }) {
        const data = await this._post('/personel', { kod, jeton });
        return Array.isArray(data) ? data : [];
    }

    /**
     * Get cities list
     */
    async iller({ kod, jeton }) {
        const data = await this._post('/iller', { kod, jeton });
        return Array.isArray(data) ? data : [];
    }

    /**
     * Get districts list for a city
     */
    async ilceler({ kod, jeton, ilId }) {
        const data = await this._post('/ilceler', { kod, jeton, il: ilId });
        return Array.isArray(data) ? data : [];
    }

    /**
     * Submit a trip
     */
    async seferbildir(params) {
        // params: kod, jeton, arac, telefon, grupadi, grupucret, tarih, tarih_saat, baslangic_il, baslangic_ilce,
        // baslangic_yer, bitis_il, bitis_ilce, bitis_yer, personel[],
        // yolcu_uyruk[], yolcu_tc_pasaport[], yolcu_ad[], yolcu_soyad[], yolcu_koltuk[], yolcu_tel[], yolcu_cinsiyet[]
        const response = await this._post('/seferbildir', params);
        
        // Expected response:
        // [ { "hata": "xxx" } ] OR { "sonuc": "basarili", "sefer_referans_no": "...", "iletisim_referans_no": "..." }
        if (Array.isArray(response) && response.length > 0 && response[0].hata) {
            throw new Error(`UETDS Hata: ${response[0].hata}`);
        }
        
        if (response && response.sonuc === 'basarili') {
            return response; // Contains sefer_referans_no
        }
        
        throw new Error('Bilinmeyen bir hata oluştu: ' + JSON.stringify(response));
    }

    // --- High-level Wrapper for Dynamic Matching ---

    async submitDynamicTrip({ credentials, reservation, vehicleData, driverData, passengers }) {
        const kod = credentials.kod || credentials.firmaKodu;
        const email = credentials.email || credentials.username;
        const parola = credentials.parola || credentials.password;
        
        // 1. Login
        const jeton = await this.giris({ kod, email, parola });

        // 2. Fetch required reference lists
        const [araclar, personeller, iller] = await Promise.all([
            this.araclar({ kod, jeton }),
            this.personel({ kod, jeton }),
            this.iller({ kod, jeton })
        ]);

        // 3. Find Vehicle ID
        const normalizedPlate = vehicleData.plate.replace(/\s+/g, '').toUpperCase();
        const matchedVehicle = araclar.find(a => String(a.plaka).replace(/\s+/g, '').toUpperCase() === normalizedPlate);
        if (!matchedVehicle) {
            throw new Error(`Araç bulunamadı (${normalizedPlate}). Lütfen aracı UETDS.net paneline ekleyin.`);
        }

        // 4. Find Driver ID
        const matchedDriver = personeller.find(p => p.tc === String(driverData.tcNo));
        if (!matchedDriver) {
            throw new Error(`Şoför bulunamadı (TC: ${driverData.tcNo}). Lütfen şoförü UETDS.net paneline ekleyin.`);
        }

        // 5. Match Cities (Antalya -> 7, etc.)
        // This is a naive match for demo purposes. It matches start and end province.
        let baslangic_il_id = 7; // Default to Antalya
        let bitis_il_id = 7;
        const startProvinceStr = reservation.pickupCity?.toUpperCase() || 'ANTALYA';
        const endProvinceStr = reservation.dropoffCity?.toUpperCase() || 'ANTALYA';
        
        const startCityMatch = iller.find(i => String(i.ad).toUpperCase().includes(startProvinceStr));
        if (startCityMatch) baslangic_il_id = startCityMatch.id;
        
        const endCityMatch = iller.find(i => String(i.ad).toUpperCase().includes(endProvinceStr));
        if (endCityMatch) bitis_il_id = endCityMatch.id;

        // Fetch districts
        const startDistricts = await this.ilceler({ kod, jeton, ilId: baslangic_il_id });
        const endDistricts = await this.ilceler({ kod, jeton, ilId: bitis_il_id });

        let baslangic_ilce_id = startDistricts.length > 0 ? startDistricts[0].id : '';
        let bitis_ilce_id = endDistricts.length > 0 ? endDistricts[0].id : '';

        const payload = {
            kod,
            jeton,
            arac: matchedVehicle.id,
            telefon: String(driverData.phone).replace(/\D/g, '') || '5350000000',
            grupadi: reservation.groupName || 'TRANSFER',
            grupucret: reservation.price || 0,
            tarih: reservation.date, // Format: YYYY-MM-DD
            tarih_saat: reservation.time, // Format: HH:mm
            baslangic_il: baslangic_il_id,
            baslangic_ilce: baslangic_ilce_id,
            baslangic_yer: reservation.pickupLocation || 'Merkez',
            bitis_il: bitis_il_id,
            bitis_ilce: bitis_ilce_id,
            bitis_yer: reservation.dropoffLocation || 'Merkez',
            'personel[]': [matchedDriver.id],
            'personel_gorev[]': ['sofor'],
            
            // Passenger Arrays
            'yolcu_uyruk[]': [],
            'yolcu_tc_pasaport[]': [],
            'yolcu_ad[]': [],
            'yolcu_soyad[]': [],
            'yolcu_koltuk[]': [],
            'yolcu_tel[]': [],
            'yolcu_cinsiyet[]': []
        };

        passengers.forEach((p, i) => {
            payload['yolcu_uyruk[]'].push(p.nationality || 'TR');
            payload['yolcu_tc_pasaport[]'].push(p.documentNo || '11111111111');
            payload['yolcu_ad[]'].push(p.firstName || 'YOLCU');
            payload['yolcu_soyad[]'].push(p.lastName || 'SOYADI');
            payload['yolcu_koltuk[]'].push(String(i + 1));
            payload['yolcu_tel[]'].push(String(p.phone).replace(/\D/g, '') || '5350000000');
            payload['yolcu_cinsiyet[]'].push(p.gender === 'K' || p.gender === 'F' || p.gender === '2' ? 'K' : 'E'); // E: Erkek, K: Kadın
        });

        return await this.seferbildir(payload);
    }
}

module.exports = new UetdsRestService();
