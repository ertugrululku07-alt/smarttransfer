fetch('http://localhost:3000/api/transfer/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        pickup: "Antalya Havalimanı",
        dropoff: "Manavgat",
        passengers: 1,
        pickupDateTime: "2026-03-25T12:00:00Z",
        distance: 70
    })
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2))).catch(console.error);
