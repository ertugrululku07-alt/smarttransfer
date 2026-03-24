const axios = require('axios');
const jwt = require('jsonwebtoken');

const token = jwt.sign(
    { id: '137423bf-7d17-4a1f-b55f-17f0af3a8ee1', tenantId: '00000000-0000-0000-0000-000000000001', context: 'USER' },
    process.env.JWT_SECRET || 'secret'
);

async function check() {
    try {
        const res = await axios.get('http://localhost:4000/api/kasa/entries?from=2026-03-01T00:00:00.000Z', {
            headers: { Authorization: `Bearer ${token}` }
        });

        const eps = res.data.data.entries;
        const agDeps = eps.filter(e => e.category === 'Acente Depozitosu');
        console.log("Agency Deposits found in Kasa entries:");
        console.log(agDeps);
        console.log("Totals:", res.data.data.totals);
    } catch (e) {
        console.error(e.response?.data || e.message);
    }
}
check();
