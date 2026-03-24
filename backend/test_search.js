const axios = require('axios');
async function test() {
  try {
    const res = await axios.post('http://localhost:4000/api/transfer/search', {
      pickup: "Antalya Havalimanı",
      dropoff: "Alanya",
      pickupLat: 36.900,
      pickupLng: 30.797,
      dropoffLat: 36.541,
      dropoffLng: 31.996,
      pickupDateTime: "2024-06-01T10:00:00",
      passengers: 2,
      transferType: "ONE_WAY"
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch(e) {
    console.error(e.message);
  }
}
test();
