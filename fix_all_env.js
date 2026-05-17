// This script replaces ALL inline process.env.NEXT_PUBLIC_API_URL patterns
// with the centralized API_URL import from @/lib/api-client
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'frontend', 'src');

// The long dynamic URL pattern used across all files
const DYNAMIC_PATTERN = /\(typeof window !== 'undefined' && window\.location\.hostname !== 'localhost' && window\.location\.hostname !== '127\.0\.0\.1' \? 'https:\/\/api\.' \+ window\.location\.hostname\.replace\('www\.', ''\) : \(process\.env\.NEXT_PUBLIC_API_URL \|\| 'http:\/\/localhost:4000'\)(?:\.replace\(\/\[\\r\\n\]\+\/g, ''\)\.trim\(\))?\)/g;

// Also match the simpler pattern without .replace
const SIMPLE_PATTERN = /typeof window !== 'undefined' && window\.location\.hostname !== 'localhost' && window\.location\.hostname !== '127\.0\.0\.1' \? 'https:\/\/api\.' \+ window\.location\.hostname\.replace\('www\.', ''\) : \(process\.env\.NEXT_PUBLIC_API_URL \|\| 'http:\/\/localhost:4000'\)/g;

function walkDir(dir) {
    const files = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkDir(fullPath));
        } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
            files.push(fullPath);
        }
    }
    return files;
}

const files = walkDir(srcDir);
let totalFixed = 0;

for (const filePath of files) {
    // Skip api-client.ts itself
    if (filePath.includes('api-client.ts')) continue;
    
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    
    // Check if file has process.env.NEXT_PUBLIC_API_URL
    if (!content.includes('process.env.NEXT_PUBLIC_API_URL')) continue;
    
    const relPath = path.relative(path.join(__dirname, 'frontend'), filePath);
    
    // Replace the long dynamic pattern with just API_URL import
    // First, check if file already imports API_URL from api-client
    const hasApiClientImport = content.includes("from '@/lib/api-client'") || content.includes('from "@/lib/api-client"');
    const hasApiUrlImport = content.includes('API_URL') && hasApiClientImport;
    
    // Replace all inline URL constructions with API_URL
    // Pattern 1: Used as template literal base: `${(typeof window...)}` 
    content = content.replace(
        /\$\{\(typeof window !== 'undefined' && window\.location\.hostname !== 'localhost' && window\.location\.hostname !== '127\.0\.0\.1' \? 'https:\/\/api\.' \+ window\.location\.hostname\.replace\('www\.', ''\) : \(process\.env\.NEXT_PUBLIC_API_URL \|\| 'http:\/\/localhost:4000'\)(?:\.replace\(\/\[\\r\\n\]\+\/g, ''\)\.trim\(\))?\)\}/g,
        '${API_URL}'
    );
    
    // Pattern 2: Assigned to a const/let variable
    content = content.replace(
        /(?:const|let)\s+(API_URL|API_BASE|rawApiUrl|URL)\s*=\s*\(typeof window !== 'undefined' && window\.location\.hostname !== 'localhost' && window\.location\.hostname !== '127\.0\.0\.1' \? 'https:\/\/api\.' \+ window\.location\.hostname\.replace\('www\.', ''\) : \(process\.env\.NEXT_PUBLIC_API_URL \|\| 'http:\/\/localhost:4000'\)(?:\.replace\(\/\[\\r\\n\]\+\/g, ''\)\.trim\(\))?\);/g,
        (match, varName) => {
            if (varName === 'API_URL') return ''; // Will be imported
            return `const ${varName} = API_URL;`;
        }
    );
    
    // Pattern 3: Simple process.env.NEXT_PUBLIC_API_URL || fallback  
    content = content.replace(
        /process\.env\.NEXT_PUBLIC_API_URL \|\| ['"]http:\/\/localhost:4000['"]/g,
        'API_URL'
    );
    
    // If we made changes, ensure API_URL is imported
    if (content !== original) {
        // Add API_URL import if not already present
        if (!content.includes("import { API_URL }") && !content.includes("API_URL }") && !content.includes("{ API_URL")) {
            if (content.includes("from '@/lib/api-client'")) {
                // Already imports something from api-client, add API_URL
                content = content.replace(
                    /import\s+(?:apiClient\s*,\s*)?\{([^}]+)\}\s+from\s+'@\/lib\/api-client'/,
                    (match, imports) => {
                        if (imports.includes('API_URL')) return match;
                        return match.replace('{' + imports + '}', '{ API_URL, ' + imports.trim() + ' }');
                    }
                );
                // Handle default + named imports  
                content = content.replace(
                    /import\s+apiClient\s+from\s+'@\/lib\/api-client'/,
                    "import apiClient, { API_URL } from '@/lib/api-client'"
                );
            } else {
                // No existing import, add one after 'use client' or at the top
                if (content.includes("'use client'")) {
                    content = content.replace(
                        "'use client';",
                        "'use client';\nimport { API_URL } from '@/lib/api-client';"
                    );
                } else {
                    content = "import { API_URL } from '@/lib/api-client';\n" + content;
                }
            }
        }
        
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Fixed: ${relPath}`);
        totalFixed++;
    } else {
        console.log(`⚠️  Has process.env ref but pattern not matched: ${relPath}`);
        // Show the line for debugging
        const lines = content.split('\n');
        lines.forEach((line, i) => {
            if (line.includes('process.env.NEXT_PUBLIC_API_URL')) {
                console.log(`   Line ${i+1}: ${line.trim().substring(0, 120)}...`);
            }
        });
    }
}

console.log(`\nTotal files fixed: ${totalFixed}`);
