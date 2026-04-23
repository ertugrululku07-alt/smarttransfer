// Check if the fix is actually in the file
const code = require('fs').readFileSync('src/routes/transfer.js', 'utf8');

// Check for the old bug pattern
if (code.includes('const updateData = {\n            metadata: newMetadata\n        };') || 
    code.includes('const updateData = {\r\n            metadata: newMetadata\r\n        };')) {
    console.log('❌ OLD BUG STILL PRESENT - updateData declared after usage');
} else {
    console.log('✅ Old bug pattern not found');
}

// Check for new fix
if (code.includes('const updateData = {};')) {
    console.log('✅ FIX PRESENT - updateData = {} declared early');
} else {
    console.log('❌ FIX NOT FOUND');
}

if (code.includes('updateData.metadata = newMetadata;')) {
    console.log('✅ metadata assignment found');
} else {
    console.log('❌ metadata assignment NOT found');
}

// Now let's try to syntax-check the PATCH handler specifically
// Find the line numbers around the issue
const lines = code.split('\n');
let patchStart = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("router.patch('/bookings/:id'")) {
        patchStart = i;
        break;
    }
}
console.log('\nPATCH handler starts at line:', patchStart + 1);

// Show the relevant section
console.log('\n--- Lines around updateData ---');
for (let i = patchStart; i < Math.min(patchStart + 250, lines.length); i++) {
    const line = lines[i].trim();
    if (line.includes('updateData') || line.includes('newMetadata') || line.includes('operationalStatus')) {
        console.log(`${i + 1}: ${lines[i].trimEnd()}`);
    }
}
