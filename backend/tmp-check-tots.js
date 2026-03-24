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

        const resA = await axios.get(`http://localhost:4000/api/kasa/entries?from=${from}&to=${to}&limit=1000`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const resB = await axios.get(`http://localhost:4000/api/kasa/accounts?from=${from}&to=${to}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const entriesTotals = resA.data.data.totals;
        const accountsData = resB.data.data;

        let accTotalIn = 0;
        let accTotalOut = 0;

        Object.values(accountsData).forEach(a => {
            accTotalIn += a.in;
            accTotalOut += a.out;
        });

        console.log("=== ENTRIES ===");
        console.log(entriesTotals);

        console.log("=== ACCOUNTS ===");
        console.log({ in: accTotalIn, out: accTotalOut, net: accTotalIn - accTotalOut });
        console.log(accountsData);

    } catch (e) {
        console.error(e.response?.data || e.message);
    }
}
check();
