const fs = require('fs');
const { execSync } = require('child_process');

const path = 'd:\\SmartTransfer\\backend\\prisma\\rebuilt.prisma';
const target = 'd:\\SmartTransfer\\backend\\prisma\\incremental.prisma';

try {
    const content = fs.readFileSync(path, 'utf8');

    // Extract base (Generator + Datasource)
    // We assume they appear early.
    // Let's just hardcode a valid base for testing, 
    // or try to find where they end.

    // Find the end of datasource block
    const dsEnd = content.indexOf('datasource db {');
    if (dsEnd === -1) throw new Error('No datasource found');

    let baseEnd = content.indexOf('}', dsEnd);
    baseEnd++; // Include }

    const baseContent = content.substring(0, baseEnd);

    console.log('Base content length:', baseContent.length);

    // Split the rest by 'model ' or 'enum '
    const restContent = content.substring(baseEnd);
    const regex = /(model|enum)\s+(\w+)\s+\{/g;

    let match;
    const indices = []; // Relative to restContent
    while ((match = regex.exec(restContent)) !== null) {
        indices.push(match.index);
    }
    indices.push(restContent.length);

    let validContent = baseContent;

    console.log(`Found ${indices.length - 1} models/enums.`);

    for (let i = 0; i < indices.length - 1; i++) {
        const start = indices[i];
        const end = indices[i + 1];
        const block = restContent.substring(start, end);

        const testContent = validContent + '\n' + block;
        fs.writeFileSync(target, testContent);

        try {
            execSync(`npx prisma validate --schema=prisma/incremental.prisma`, { stdio: 'ignore' });
            validContent = testContent;
            // console.log(`Block ${i} valid.`);
        } catch (e) {
            console.error(`Block ${i} FAILED validaton!`);
            console.log('--- Block Content ---');
            console.log(block.substring(0, 200) + '...');
            console.log('---------------------');

            // Try to salvage? No, just skip this block and continue?
            // If we skip, we might miss dependencies.
            // But usually validation failure here means syntax error.
            // Let's stop to see what it is.
            process.exit(1);
        }
    }

    console.log('Finished incremental check. All valid.');
    fs.writeFileSync('d:\\SmartTransfer\\backend\\prisma\\schema.prisma', validContent); // Write to REAL file if all good!

} catch (e) {
    console.error(e);
}
