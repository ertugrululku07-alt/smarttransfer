const axios = require('axios');

async function testBooking() {
    try {
        const payload = {
            vehicleType: 'Vito',
            pickup: 'Antalya Airport',
            dropoff: 'Alanya',
            pickupDateTime: new Date().toISOString(),
            passengers: 2,
            price: 1500,
            currency: 'TRY',
            customerInfo: {
                fullName: 'Test Musteri Fatura',
                email: 'test@fatura.com',
                phone: '+905551234567'
            },
            billingDetails: {
                type: 'individual',
                fullName: 'TEST SAHIS',
                tcNo: '11111111111',
                address: 'Test Adres'
            }
        };

        const res = await axios.post('http://localhost:3000/api/transfer/book', payload, {
            headers: {
                'x-tenant-slug': 'smarttravel-demo',
                'Content-Type': 'application/json'
            }
        });

        console.log('Booking Success:', res.data.success);
        console.log('Booking Number:', res.data.data.bookingNumber);

        // Let's quickly check the invoices endpoint via a fake token or just DB query string
    } catch (err) {
        console.error('Test failed:', err.response?.data || err.message);
    }
}

testBooking();
