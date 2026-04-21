async function testSearch() {
  const payload1 = {
    pickup: 'Alanya/Antalya, Türkiye',
    dropoff: 'Antalya Havalimanı, Havaalanı Yolu, 07230, Altınova Yenigöl, Muratpaşa/Antalya, Türkiye',
    pickupDateTime: '2026-04-22T12:00:00.000Z',
    passengers: 1,
    distance: 126.2,
    transferType: 'ONE_WAY',
    pickupLat: 36.5438,
    pickupLng: 31.9998,
    dropoffLat: 36.8984,
    dropoffLng: 30.8005,
    encodedPolyline: 'dummy'
  };

  const payload2 = {
    pickup: 'Alanya/Antalya, Türkiye',
    dropoff: 'Antalya, Türkiye',
    pickupDateTime: '2026-04-29T12:00:00.000Z',
    passengers: 1,
    distance: 134.5,
    transferType: 'ONE_WAY',
    pickupLat: 36.5438,
    pickupLng: 31.9998,
    dropoffLat: 36.8969,
    dropoffLng: 30.7133,
    encodedPolyline: 'dummy'
  };

  for (const p of [payload1, payload2]) {
      const response = await fetch('https://frontend-production-18bd.up.railway.app/api/transfer/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p)
      });
      const data = await response.json();
      console.log(`\n=== Search: ${p.dropoff} ===`);
      if (data.data && data.data.results) {
         data.data.results.forEach(r => console.log(`${r.vehicleType}: ${r.price} TL`));
      } else {
         console.log(data);
      }
  }
}
testSearch().catch(console.error);
