const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const flexpolyline = require('@here/flexpolyline');
const turf = require('@turf/turf');
const axios = require('axios');

async function main() {
  const HERE_KEY = process.env.HERE_API_KEY || 'RH04HVBUK6By3GfYWwVlCOG4Or1IzV-rRjygQRHbIvo';
  
  // 1. Get exact coords using Geocoding
  let pickup = 'Gazipaşa Alanya Havalimanı, 07900, Sarıağaç, Gazipaşa/Antalya, Türkiye';
  let dropoff = 'Kestel, Alanya/Antalya, Türkiye';
  
  const geo1 = await axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(pickup)}&apiKey=${HERE_KEY}`);
  const geo2 = await axios.get(`https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(dropoff)}&apiKey=${HERE_KEY}`);
  
  const oLat = geo1.data.items[0].position.lat, oLng = geo1.data.items[0].position.lng;
  const dLat = geo2.data.items[0].position.lat, dLng = geo2.data.items[0].position.lng;
  
  console.log(`Exact coords - Origin: ${oLat},${oLng} | Dest: ${dLat},${dLng}`);
  
  const routeUrl = `https://router.hereapi.com/v8/routes?transportMode=car&origin=${oLat},${oLng}&destination=${dLat},${dLng}&return=summary,polyline&apiKey=${HERE_KEY}`;
  console.log('Fetching route...');
  
  const res = await axios.get(routeUrl);
  const route = res.data.routes[0];
  const section = route.sections[0];
  const polylineStr = section.polyline;
  
  console.log('Polyline fetched.');
  const decoded = flexpolyline.decode(polylineStr);
  const routeCoords = decoded.polyline.map(p => [p[1], p[0]]); // [lng, lat] for Turf!
  
  // 2. Fetch MAHMUTLAR zone
  const zones = await prisma.zone.findMany({ where: { name: 'MAHMUTLAR' } });
  if(zones.length === 0) return console.log('NO MAHMUTLAR ZONE FOUND!');
  
  const zone = zones[0];
  let polyCoords = zone.polygon.map(p => [p.lng, p.lat]);
  if (polyCoords[0][0] !== polyCoords[polyCoords.length - 1][0] || 
      polyCoords[0][1] !== polyCoords[polyCoords.length - 1][1]) {
      polyCoords.push(polyCoords[0]);
  }
  const zonePolygon = turf.polygon([polyCoords]);
  
  // 3. Test distFromEnd
  let distFromEnd = 0;
  let hitEnd = false;
  let log = [];
  for (let i = routeCoords.length - 1; i > 0; i--) {
      if (turf.booleanPointInPolygon(turf.point(routeCoords[i]), zonePolygon)) {
          log.push(`HIT! Route coordinate index ${i} is INSIDE the MAHMUTLAR polygon!`);
          hitEnd = true;
          break;
      }
      distFromEnd += turf.distance(turf.point(routeCoords[i]), turf.point(routeCoords[i-1]), { units: 'kilometers' });
  }
  
  log.push(`hitEnd: ${hitEnd}, distFromEnd: ${distFromEnd.toFixed(2)} km`);
  require('fs').writeFileSync('test_out.txt', log.join('\\n'));
  console.log('DONE');
}

main().catch(console.error).finally(()=>process.exit(0));
