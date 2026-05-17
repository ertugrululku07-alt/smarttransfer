const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function run() {
    const html = await fetchUrl('https://www.jet2home.com/login');
    const regex = /\/_next\/static\/[^"'\s]+\.js/g;
    const jsFiles = new Set();
    let match;
    while ((match = regex.exec(html)) !== null) {
        jsFiles.add(match[0]);
    }
    
    console.log(`Checking ${jsFiles.size} JS files for baseURL/API_URL/railway...\n`);
    
    for (const jsPath of jsFiles) {
        const url = 'https://www.jet2home.com' + jsPath;
        try {
            const js = await fetchUrl(url);
            
            // Check for the apiClient baseURL definition
            if (js.includes('baseURL')) {
                const matches = [...js.matchAll(/.{0,60}baseURL.{0,60}/g)];
                if (matches.some(m => m[0].includes('railway') || m[0].includes('backend-production'))) {
                    console.log(`❌ RAILWAY IN baseURL! File: ${jsPath}`);
                    matches.forEach(m => console.log(`  ${m[0]}`));
                }
            }
            
            // Check for backend-production anywhere
            if (js.includes('backend-production')) {
                console.log(`❌ FOUND backend-production IN: ${jsPath}`);
                const matches = [...js.matchAll(/.{0,80}backend-production.{0,80}/g)];
                matches.forEach(m => console.log(`  ${m[0]}`));
            }
            
            // Check for the dynamic API URL construction
            if (js.includes('api.jet2home')) {
                console.log(`✅ Found api.jet2home.com reference in: ${jsPath}`);
            }
            
            // Check the env value that got baked in
            if (js.includes('NEXT_PUBLIC_API_URL') || js.includes('api_url')) {
                const matches = [...js.matchAll(/.{0,40}(NEXT_PUBLIC_API_URL|api_url).{0,60}/gi)];
                matches.forEach(m => console.log(`  ENV ref in ${jsPath}: ${m[0]}`));
            }
            
        } catch(e) {}
    }
    
    // Also check RSC payload
    console.log('\n--- Checking HTML for inline railway refs ---');
    if (html.includes('backend-production')) {
        console.log('❌ FOUND backend-production IN HTML!');
        const matches = [...html.matchAll(/.{0,80}backend-production.{0,80}/g)];
        matches.forEach(m => console.log(`  ${m[0]}`));
    } else {
        console.log('✅ HTML clean');
    }
    
    // Check response headers
    console.log('\n--- Checking page headers ---');
    const headers = await new Promise((resolve, reject) => {
        https.get('https://www.jet2home.com/login', res => {
            resolve(res.headers);
            res.destroy();
        }).on('error', reject);
    });
    console.log('x-nextjs-cache:', headers['x-nextjs-cache']);
    console.log('x-nextjs-prerender:', headers['x-nextjs-prerender']);
    console.log('cache-control:', headers['cache-control']);
    console.log('etag:', headers['etag']);
}

run();
