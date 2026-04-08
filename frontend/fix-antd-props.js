const fs = require('fs');
const path = require('path');

function processDirectory(dirPath) {
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let originalContent = content;

            // Fix bordered={false} -> variant="borderless"
            content = content.replace(/bordered=\{false\}/g, 'variant="borderless"');

            // Fix valueStyle={{ color: '#fff', fontSize: 28, fontWeight: 600 }}
            // We want styles={{content: { color: '#fff', fontSize: 28, fontWeight: 600 }}}
            // Note: .*? matches non-greedily inside the double braces
            content = content.replace(/valueStyle=\{\{([^}]+)\}\}/g, 'styles={{content: {$1}}}');

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated ${fullPath}`);
            }
        }
    }
}

processDirectory(path.join(__dirname, 'src', 'app', 'admin'));
console.log('Done');
