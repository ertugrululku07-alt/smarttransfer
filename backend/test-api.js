const http = require('http');

const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/accounting/accounts/partner-0fad6bec-9abf-47e8-ac78-3b2868b627bf/transactions',
    method: 'GET',
    headers: {
        // We don't have a valid auth token, but we can bypass it by patching accounting.js locally or just printing status
    }
};

const req = http.request(options, res => {
    console.log(`statusCode: ${res.statusCode}`);
    res.on('data', d => {
        process.stdout.write(d);
    });
});

req.on('error', error => {
    console.error(error);
});

req.end();
