const axios = require('axios');
const util = require('util');

async function main() {
  const HERE_KEY = process.env.HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';
  
  // Geocode exact pickup and dropoff
  let pickup = 'Gazipaşa Alanya Havalimanı, 07900, Sarıağaç, Gazipaşa/Antalya, Türkiye';
  let dropoff = 'Kestel, Alanya/Antalya, Türkiye';
  console.log('Geocoding...');
  
  const geo1 = await axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(pickup)}&apiKey=${HERE_KEY}`);
  const geo2 = await axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(dropoff)}&apiKey=${HERE_KEY}`);
  
  const oLat = geo1.data.items[0].position.lat, oLng = geo1.data.items[0].position.lng;
  const dLat = geo2.data.items[0].position.lat, dLng = geo2.data.items[0].position.lng;
  
  // Get route to extract encodedPolyline
  console.log('Getting route...');
  const routeUrl = `https://router.hereapi.com/v8/routes?transportMode=car&origin=${oLat},${oLng}&destination=${dLat},${dLng}&return=summary,polyline&apiKey=${HERE_KEY}`;
  const res = await axios.get(routeUrl);
  const route = res.data.routes[0];
  const section = route.sections[0];
  const polylineStr = section.polyline;
  const distanceKm = section.summary.length / 1000;
  
  console.log(`EncodedPolyline: ${polylineStr.substring(0,20)}...`);
  
  // Hit the backend
  console.log('Hitting local backend search...');
  const payload = {
    pickup,
    dropoff,
    pickupDateTime: '2026-03-25T12:00:00.000Z',
    distance: distanceKm,
    passengers: 1,
    encodedPolyline: polylineStr
  };
  
  const searchRes = await fetch('http://localhost:4000/api/transfer/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const d = await searchRes.json();
  console.log('Backend response (first result):');
  console.log(util.inspect(d.data.results[0], {depth: null, colors: true}));
}

main().catch(console.error).finally(()=>process.exit(0));
