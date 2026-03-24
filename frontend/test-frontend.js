async function testApi() {
    try {
        const loginRes = await fetch('https://smarttransfer-backend-production.up.railway.app/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': 'smarttravel-demo' },
            body: JSON.stringify({ email: 'admin@smarttravel.com', password: 'password123' })
        });
        const loginData = await loginRes.json();
        if (!loginData.success) {
            console.log('Login failed:', loginData);
            return;
        }
        const token = loginData.data.token;

        const res = await fetch('https://smarttransfer-backend-production.up.railway.app/api/transfer/bookings', {
            headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-Slug': 'smarttravel-demo' }
        });
        const data = await res.json();
        if (data.success) {
            const b2b = data.data.find(b => b.bookingNumber === 'B2B428253');
            console.log('Booking returned from Railway API:', JSON.stringify(b2b, null, 2));
        } else {
            console.log('API Error', data);
        }
    } catch (err) {
        console.error(err);
    }
}

testApi();
