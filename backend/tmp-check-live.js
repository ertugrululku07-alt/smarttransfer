const axios = require('axios');
const jwt = require('jsonwebtoken');

const token = jwt.sign(
    { id: '137423bf-7d17-4a1f-b55f-17f0af3a8ee1', tenantId: '00000000-0000-0000-0000-000000000001', context: 'USER' },
    process.env.JWT_SECRET || 'secret'
);

async function check() {
    try {
        const from = '2026-03-01T00:00:00.000Z';
        const to = '2026-03-04T20:59:59.999Z';

        let urlA = `http://localhost:4000/api/kasa/entries?from=${from}&to=${to}&limit=5000`;
        const resA = await axios.get(urlA, { headers: { Authorization: `Bearer ${token}` } });
        console.log("Entries Date Filter Totals:", resA.data.data.totals);

        let urlB = `http://localhost:4000/api/kasa/accounts?from=${from}&to=${to}`;
        const resB = await axios.get(urlB, { headers: { Authorization: `Bearer ${token}` } });

        let inB = 0; let outB = 0;
        Object.values(resB.data.data).forEach(x => { inB += x.in; outB += x.out; });
        console.log("Accounts Date Filter Totals:", { in: inB, out: outB, net: inB - outB });

        // Let's do ALL TIME:
        let urlC = `http://localhost:4000/api/kasa/entries?from=&to=&limit=5000`;
        const resC = await axios.get(urlC, { headers: { Authorization: `Bearer ${token}` } });
        console.log("Entries ALL TIME:", resC.data.data.totals);

        let urlD = `http://localhost:4000/api/kasa/accounts?from=&to=`;
        const resD = await axios.get(urlD, { headers: { Authorization: `Bearer ${token}` } });
        let inD = 0; let outD = 0;
        Object.values(resD.data.data).forEach(x => { inD += x.in; outD += x.out; });
        console.log("Accounts ALL TIME:", { in: inD, out: outD, net: inD - outD });

    } catch (e) {
        console.log(e.response?.data || e.message);
    }
}
check();
