const axios = require('axios');

async function check() {
    try {
        const payload = {
            pickup: "Antalya Havalimanı, Havaalanı Yolu, Muratpaşa/Antalya, Türkiye",
            dropoff: "Kemer/Antalya, Türkiye",
            pickupDateTime: "2026-03-25T12:00:00.000Z",
            passengers: 1,
            transferType: "ONE_WAY",
            distance: 59.3,
            encodedPolyline: "" // Skipping polyline for simplicity to force fallback
        };
        const res = await axios.post('http://localhost:4000/api/transfer/search', payload, {
            headers: { 'Content-Type': 'application/json', 'x-tenant-slug': 'default' } // Try to bypass or use default tenant if necessary
        });
        console.log("Status:", res.status);
        console.log("Data:", JSON.stringify(res.data, null, 2));
    } catch (e) {
        console.error("API Error:", e.response ? e.response.status : e.message);
        if(e.response) console.error("API Data:", JSON.stringify(e.response.data, null, 2));
    }
}
check();
