const axios = require('axios');

async function testSearches() {
    const baseUrl = 'http://localhost:3001/api'; // Adjust if needed
    
    console.log('--- TEST 1: Kemer -> AYT (Should be blocked if outside zones) ---');
    try {
        const res1 = await axios.post(`${baseUrl}/transfer/search`, {
            pickup: 'Kemer/Antalya, Türkiye',
            dropoff: 'Antalya Havalimanı, Antalya, Türkiye',
            pickupDateTime: '2026-04-30T12:00:00.000',
            passengers: 1,
            transferType: 'ONE_WAY',
            distance: 58.8
        });
        const results = res1.data.data.results;
        console.log(`Results found: ${results.length}`);
        results.forEach(r => console.log(`- ${r.vehicleType}: ${r.price} ${r.currency}`));
    } catch (e) {
        console.error('Test 1 failed:', e.message);
    }

    console.log('\n--- TEST 2: Alanya -> GZP (Should NOT match AYT shuttle) ---');
    try {
        const res2 = await axios.post(`${baseUrl}/transfer/search`, {
            pickup: 'Alanya/Antalya, Türkiye',
            dropoff: 'Gazipaşa Alanya Havalimanı, Türkiye',
            pickupDateTime: '2026-04-19T12:00:00.000',
            passengers: 1,
            transferType: 'ONE_WAY',
            distance: 41.0
        });
        const shuttleResults = res2.data.data.results.filter(r => r.isShuttle);
        console.log(`Shuttle results found: ${shuttleResults.length}`);
    } catch (e) {
        console.error('Test 2 failed:', e.message);
    }
}

// Since I can't easily run a full server and DB in this environment with axios requests to localhost,
// I'll try to run a subset of the logic or just rely on the code review if I can't start the server.
// Actually, I'll just check if the server is running.
testSearches();
