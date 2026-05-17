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
    
    console.log(`Found ${jsFiles.size} JS files`);
    
    for (const jsPath of jsFiles) {
        const url = 'https://www.jet2home.com' + jsPath;
        try {
            const js = await fetchUrl(url);
            
            // Check if this bundle contains the login form logic
            if (js.includes('auth/login') || js.includes('api/auth')) {
                console.log(`\n=== FOUND LOGIN LOGIC IN: ${jsPath} ===`);
                
                // Check which pattern is used
                if (js.includes('apiClient.post')) {
                    console.log('✅ NEW CODE: Uses apiClient.post (centralized)');
                } 
                if (js.includes('axios.post')) {
                    console.log('❌ OLD CODE: Uses axios.post (inline URL)');
                }
                
                // Show the actual auth/login context
                const authMatches = [...js.matchAll(/.{0,100}auth\/login.{0,100}/g)];
                authMatches.forEach((m, i) => {
                    console.log(`  Context ${i+1}: ...${m[0].substring(0, 200)}...`);
                });
            }
            
            // Also check for any NEXT_PUBLIC_API_URL that got baked in with railway
            if (js.includes('backend-production-69e7')) {
                console.log(`\n❌❌❌ FOUND BAKED RAILWAY URL IN: ${jsPath}`);
                const m = js.match(/.{0,80}backend-production-69e7.{0,80}/);
                console.log('  ', m[0]);
            }
        } catch(e) {}
    }
}

run();
