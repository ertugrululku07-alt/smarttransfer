const axios = require('axios');
const jwt = require('jsonwebtoken');

const token = jwt.sign(
    { id: '137423bf-7d17-4a1f-b55f-17f0af3a8ee1', tenantId: '00000000-0000-0000-0000-000000000001', context: 'USER' },
    process.env.JWT_SECRET || 'secret'
);

async function run() {
    try {
        const from = '2026-03-01T00:00:00.000Z';
        const to = '2026-03-04T20:59:59.999Z';

        const rEntries = await axios.get(`http://localhost:4000/api/kasa/entries?from=${from}&to=${to}&limit=5000`, { headers: { Authorization: `Bearer ${token}` } });
        const eps = rEntries.data.data.entries;

        const summaryFromTable = {
            in: eps.filter(e => e.direction === 'IN').reduce((sum, e) => sum + e.amount, 0),
            out: eps.filter(e => e.direction === 'OUT').reduce((sum, e) => sum + e.amount, 0)
        };

        console.log("Entries Total IN:", summaryFromTable.in);
        console.log("Entries Total OUT:", summaryFromTable.out);

        const rAccounts = await axios.get(`http://localhost:4000/api/kasa/accounts?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } });
        const accs = rAccounts.data.data;
        let accIn = 0; let accOut = 0;

        Object.values(accs).forEach(a => {
            accIn += a.in; accOut += a.out;
        });

        console.log("Accounts Total IN:", accIn);
        console.log("Accounts Total OUT:", accOut);

        // Group by category to find the discrepancy
        const groupEntries = {};
        eps.forEach(e => {
            if (!groupEntries[e.source]) groupEntries[e.source] = { in: 0, out: 0 };
            if (e.direction === 'IN') groupEntries[e.source].in += e.amount;
            else groupEntries[e.source].out += e.amount;
        });
        console.log("Entries breakdown by source:");
        console.log(groupEntries);

    } catch (e) { console.error(e.message); }
}
run();
