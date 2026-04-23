const https = require('https');

function makeRequest(options, data) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
                catch (e) { resolve({ status: res.statusCode, body: body }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function main() {
    const loginRes = await makeRequest({
        hostname: 'backend-production-69e7.up.railway.app',
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ email: 'admin@smarttravel.com', password: 'Admin123!' }));
    
    const token = loginRes.body?.data?.token;
    if (!token) { console.log('Login failed'); return; }

    // Use the known booking ID from shuttle runs
    const testId = 'd200fe25-06f4-400b-9835-27da90f7487c';
    
    console.log('Testing PATCH with operationalStatus=POOL...');
    const r = await makeRequest({
        hostname: 'backend-production-69e7.up.railway.app',
        path: `/api/transfer/bookings/${testId}`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    }, JSON.stringify({ operationalStatus: 'POOL' }));
    
    console.log('Status:', r.status);
    if (r.status === 200) {
        console.log('✅ SUCCESS! Pool transfer works!');
        // Revert back
        await makeRequest({
            hostname: 'backend-production-69e7.up.railway.app',
            path: `/api/transfer/bookings/${testId}`,
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        }, JSON.stringify({ operationalStatus: 'IN_OPERATION' }));
        console.log('Reverted back to IN_OPERATION');
    } else {
        console.log('❌ STILL FAILING:', JSON.stringify(r.body));
        console.log('Deploy may not be complete yet. Wait and retry.');
    }
}

main().catch(err => console.error('Error:', err));
