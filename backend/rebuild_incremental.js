const fs = require('fs');
const { execSync } = require('child_process');

const path = 'd:\\SmartTransfer\\backend\\prisma\\rebuilt.prisma';
const target = 'd:\\SmartTransfer\\backend\\prisma\\incremental.prisma';

try {
    const content = fs.readFileSync(path, 'utf8');

    // Split by 'model ' or 'enum '
    // We'll use a regex to find start indices
    const regex = /(model|enum|generator|datasource)\s+\w+/g;
    let match;
    const indices = [0];

    while ((match = regex.exec(content)) !== null) {
        if (match.index > 0) indices.push(match.index);
    }
    indices.push(content.length);

    let validContent = '';

    console.log(`Found ${indices.length - 1} blocks.`);

    for (let i = 0; i < indices.length - 1; i++) {
        const start = indices[i];
        const end = indices[i + 1];
        const block = content.substring(start, end);

        const testContent = validContent + block;
        fs.writeFileSync(target, testContent);

        try {
            execSync(`npx prisma validate --schema=prisma/incremental.prisma`, { stdio: 'ignore' });
            validContent = testContent;
            console.log(`Block ${i} valid.`);
        } catch (e) {
            console.error(`Block ${i} FAILED validaton!`);
            console.log('--- Block Content ---');
            console.log(block.substring(0, 200) + '...');
            console.log('---------------------');
            // We stop here
            break;
        }
    }

    console.log('Finished incremental check.');

} catch (e) {
    console.error(e);
}
