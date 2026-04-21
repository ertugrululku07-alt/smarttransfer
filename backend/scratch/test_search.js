const flexpolyline = require('@here/flexpolyline');

async function testSearch() {
  const payload = {
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
    // Just a straight line polyline for testing
    encodedPolyline: flexpolyline.encode({
        polyline: [[36.5438, 31.9998], [36.8984, 30.8005]]
    })
  };

  const response = await fetch('http://127.0.0.1:5000/api/transfer/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
  });
  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

testSearch().catch(console.error);
