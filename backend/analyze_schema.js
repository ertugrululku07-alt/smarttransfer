const fs = require('fs');
const path = 'd:\\SmartTransfer\\backend\\prisma\\schema.prisma';

try {
    const content = fs.readFileSync(path, 'utf8');
    console.log(`File size: ${content.length} bytes`);

    // Check for null bytes or other weird control characters
    let badChars = 0;
    for (let i = 0; i < content.length; i++) {
        const code = content.charCodeAt(i);
        if (code === 0 || (code < 9 && code !== 0) || (code > 13 && code < 32)) {
            badChars++;
        }
    }
    console.log(`Suspicious characters count: ${badChars}`);

    // List all models
    const modelRegex = /model\s+(\w+)\s+\{/g;
    let match;
    const models = [];
    while ((match = modelRegex.exec(content)) !== null) {
        models.push({ name: match[1], index: match.index });
    }

    console.log('Models found:', models);

    // Check for multiple Account or Bank
    const counts = {};
    models.forEach(m => {
        counts[m.name] = (counts[m.name] || 0) + 1;
    });

    console.log('Model counts:', counts);

} catch (e) {
    console.error('Error:', e);
}
