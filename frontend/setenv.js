// ── SmartTransfer Frontend — Set Vercel Environment Variables ──
// Usage: node setenv.js
// Updates these before deploying to Vercel.
// For GoDaddy / self-hosted deployments, edit .env.production directly instead.

const { spawn } = require('child_process');

async function setEnv(name, value) {
    return new Promise((resolve, reject) => {
        const proc = spawn('npx.cmd', ['vercel', 'env', 'add', name, 'production']);
        proc.stdout.on('data', data => console.log(data.toString()));
        proc.stderr.on('data', data => console.log(data.toString()));
        proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error('Failed adding ' + name));
        });
        proc.stdin.write(value);
        proc.stdin.end();
    });
}

async function run() {
    try {
        // ── UPDATE THESE VALUES FOR YOUR DEPLOYMENT ──
        const BACKEND_URL = 'https://api.jet2home.com';  // Your backend domain
        const TENANT = 'smarttravel-demo';

        await setEnv('NEXT_PUBLIC_API_URL', BACKEND_URL);
        await setEnv('NEXT_PUBLIC_SOCKET_URL', BACKEND_URL);
        await setEnv('NEXT_PUBLIC_TENANT_SLUG', TENANT);
        console.log('All env vars set successfully');
    } catch (e) {
        console.error(e);
    }
}
run();
