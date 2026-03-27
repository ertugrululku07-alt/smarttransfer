// Simulate hub detection logic from transfer.js
const hubs = [
  { code: 'AYT', name: 'ANTALYA HAVALİMANI', keywords: 'AYT' },
  { code: 'GZP', name: 'GAZİPAŞA GZP', keywords: 'GZP' },
  { code: 'ANTALYA', name: 'ANTALYA', keywords: 'antalya' }
];

const normalizeLocation = (loc) => {
    if (!loc) return '';
    return loc.toLowerCase()
        .replace(' airport', '')
        .replace(' havalimanı', '')
        .replace(' havalimani', '')
        .replace(' otogar', '')
        .replace(' terminal', '')
        .trim();
};

const testCases = [
    { pickup: 'Konyaaltı/Antalya, Türkiye', dropoff: 'Alanya/Antalya, Türkiye' },
    { pickup: 'Antalya Havalimanı, Havaalanı Yolu, Antalya, Türkiye', dropoff: 'Alanya/Antalya, Türkiye' },
];

for (const { pickup, dropoff } of testCases) {
    const pickupNorm = normalizeLocation(pickup);
    const dropoffNorm = normalizeLocation(dropoff);
    const allText = pickupNorm + " " + dropoffNorm;

    console.log(`\n=== Pickup: ${pickup} ===`);
    console.log(`pickupNorm: "${pickupNorm}"`);
    console.log(`dropoffNorm: "${dropoffNorm}"`);
    console.log(`allText: "${allText}"`);

    let detectedBaseLocation = null;
    let bestMatchLength = 0;

    for (const hub of hubs) {
        const keys = hub.keywords ? hub.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k) : [];
        keys.push(hub.code.toLowerCase());
        if (hub.name) keys.push(hub.name.toLowerCase().replace('havalimanı', '').replace('airport', '').trim());

        if (hub.code === 'GZP') keys.push('gazipaşa', 'gazipasa');
        if (hub.code === 'AYT') keys.push('antalya');

        for (const k of keys) {
            if (allText.includes(k) && k.length > bestMatchLength) {
                if (k.includes('gazipaşa') || k.includes('gazipasa') || k.includes('gzp')) {
                    detectedBaseLocation = 'GZP';
                    bestMatchLength = 999;
                } else {
                    detectedBaseLocation = hub.code;
                    bestMatchLength = k.length;
                }
            }
        }
        console.log(`  Hub ${hub.code}: keys = [${keys.join(', ')}]`);
    }

    console.log(`→ detectedBaseLocation: ${detectedBaseLocation}`);
}
