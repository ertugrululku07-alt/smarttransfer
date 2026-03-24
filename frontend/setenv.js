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
        await setEnv('NEXT_PUBLIC_API_URL', 'https://smarttransfer-backend-production.up.railway.app');
        await setEnv('NEXT_PUBLIC_SOCKET_URL', 'https://smarttransfer-backend-production.up.railway.app');
        await setEnv('NEXT_PUBLIC_TENANT_SLUG', 'smarttravel-demo');
        console.log('All env vars set successfully');
    } catch (e) {
        console.error(e);
    }
}
run();
