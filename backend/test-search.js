const http = require('http');

function search(label, body) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost', port: 4000,
      path: '/api/transfer/search', method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        const results = json.data?.results || [];
        const shuttles = results.filter(r => r.isShuttle);
        console.log(`\n=== ${label} ===`);
        console.log(`Total: ${results.length}, Shuttles: ${shuttles.length}`);
        shuttles.forEach(r => console.log(`  SHUTTLE "${r.shuttleRouteName}" ${r.price} ${r.currency}`));
        resolve();
      });
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

(async () => {
  // Test 1: Manavgat merkez
  await search('Manavgat → AYT', {
    pickup: "Manavgat/Antalya, Türkiye", dropoff: "Antalya Havalimanı",
    pickupDateTime: "2026-04-25T10:00", passengers: 1, transferType: "ONE_WAY",
    pickupLat: 36.7833, pickupLng: 31.4333
  });

  // Test 2: Gündoğdu (530. Sokak coords ~ 36.7380, 31.5040)
  await search('Gündoğdu → AYT', {
    pickup: "530. Sokak 9, 07600, Gündoğdu, Manavgat/Antalya, Türkiye", dropoff: "Antalya Havalimanı",
    pickupDateTime: "2026-04-25T10:00", passengers: 1, transferType: "ONE_WAY",
    pickupLat: 36.7380, pickupLng: 31.5040
  });

  // Test 3: Kızılağaç (~ 36.7100, 31.4900)
  await search('Kızılağaç → AYT', {
    pickup: "Kızılağaç, Manavgat/Antalya", dropoff: "Antalya Havalimanı",
    pickupDateTime: "2026-04-25T10:00", passengers: 1, transferType: "ONE_WAY",
    pickupLat: 36.7100, pickupLng: 31.4900
  });
})();
