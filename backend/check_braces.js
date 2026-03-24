const fs = require('fs');
const path = 'd:\\SmartTransfer\\backend\\prisma\\rebuilt.prisma';

try {
    const content = fs.readFileSync(path, 'utf8');

    let balance = 0;
    let line = 1;
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '{') balance++;
        if (char === '}') balance--;
        if (char === '\n') line++;

        if (balance < 0) {
            console.log(`Error: Unexpected closing brace at line ${line}`);
            break;
        }
    }

    console.log(`Final brace balance: ${balance}`);

    // Check splice point
    const spliter = '// MODULE: ACCOUNTING';
    const idx = content.indexOf(spliter);
    if (idx !== -1) {
        console.log('--- Context around splice point ---');
        console.log(content.substring(idx - 100, idx + 100));
    }

} catch (e) {
    console.error(e);
}
