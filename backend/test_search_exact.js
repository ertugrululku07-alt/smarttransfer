const axios = require('axios');
const flexpolyline = require('@here/flexpolyline');

const HERE_API_KEY = process.env.NEXT_PUBLIC_HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';

async function test() {
  try {
    const pickupLat = 36.900;
    const pickupLng = 30.797;
    const dropoffLat = 36.541;
    const dropoffLng = 31.996;
    
    // Fetch real polyline
    const routerUrl = `https://router.hereapi.com/v8/routes?transportMode=car&origin=${pickupLat},${pickupLng}&destination=${dropoffLat},${dropoffLng}&return=summary,polyline&apiKey=${HERE_API_KEY}`;
    const rRes = await axios.get(routerUrl);
    const encodedPolyline = rRes.data.routes[0].sections[0].polyline;
    const distance = rRes.data.routes[0].sections[0].summary.length / 1000;

    const res = await axios.post('http://localhost:4000/api/transfer/search', {
      pickup: "Antalya Havalimanı, Havaalanı Yolu, 07230, Altınova Yenigöl, Muratpaşa/Antalya, Türkiye",
      dropoff: "Kızılalan, Alanya/Antalya, Türkiye",
      pickupLat, pickupLng, dropoffLat, dropoffLng,
      distance,
      encodedPolyline,
      pickupDateTime: "2026-03-24T12:00:00",
      passengers: 1,
      transferType: "ONE_WAY"
    });
    console.log(JSON.stringify(res.data.data.results.map(r => ({
       vehicleType: r.vehicleType,
       price: r.price,
       basePrice: r.basePrice,
       currency: r.currency,
       pricingMethod: r.pricingMethod
    })), null, 2));
  } catch(e) {
    if(e.response) console.error(JSON.stringify(e.response.data, null, 2));
    else console.error(e.message);
  }
}
test();
