const https = require('https');

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function run() {
    const html = await fetch('https://www.jet2home.com/login');
    const regex = /src="(\/_next\/static\/[^"]+\.js)"/g;
    let match;
    let found = false;
    while ((match = regex.exec(html)) !== null) {
        const jsUrl = 'https://www.jet2home.com' + match[1];
        console.log('Checking', jsUrl);
        const js = await fetch(jsUrl);
        if (js.includes('railway')) {
            console.log('!!! FOUND RAILWAY IN', jsUrl);
            found = true;
        }
    }
    if (!found) console.log('No railway string found in any JS bundles.');
}
run();
