// Test the PATCH handler logic locally (without running the full server)
// Simulates the exact code path to find the error

// Simulate the handler logic
function simulatePatchHandler() {
    const operationalStatus = 'POOL';
    const price = 0;
    const poolRunKey = 'test';
    const poolRunName = 'test';
    const poolDepartureTime = '03:00';
    
    const currentBooking = {
        metadata: {
            pickup: 'Test Pickup',
            dropoff: 'Test Dropoff',
            operationalStatus: 'IN_OPERATION'
        },
        startDate: new Date(),
        driverId: 'driver-123',
        assignedVehicleId: 'vehicle-123',
        total: 100
    };

    const estimatedDurationMinutes = 120;
    const pickupDateTime = undefined;
    const effectiveStartDate = pickupDateTime || currentBooking.startDate;
    const freeAt = new Date(new Date(effectiveStartDate).getTime() + ((estimatedDurationMinutes || 120) + 30) * 60000);

    // THE FIX: declare updateData early
    const updateData = {};

    const newMetadata = {
        ...(currentBooking.metadata || {}),
        estimatedDurationMinutes: estimatedDurationMinutes || 120,
        freeAt: freeAt.toISOString()
    };

    if (operationalStatus !== undefined) {
        newMetadata.operationalStatus = operationalStatus;
        if (operationalStatus === 'POOL' || operationalStatus === 'IN_POOL') {
            updateData.driverId = null;
            updateData.assignedVehicleId = null;
            newMetadata.driverId = null;
            newMetadata.assignedVehicleId = null;
            if (price !== undefined) {
                newMetadata.poolPrice = Number(price);
            }
        }
    }
    if (poolRunKey !== undefined) newMetadata.poolRunKey = poolRunKey;
    if (poolRunName !== undefined) newMetadata.poolRunName = poolRunName;
    if (poolDepartureTime !== undefined) newMetadata.poolDepartureTime = poolDepartureTime;

    updateData.metadata = newMetadata;

    // price !== undefined will also trigger total/subtotal update
    if (price !== undefined) {
        updateData.total = Number(price);
        updateData.subtotal = Number(price);
    }

    console.log('updateData:', JSON.stringify(updateData, null, 2));
    console.log('\n✅ No TDZ error - fix works locally');
    
    // Check if price=0 causes a Prisma issue with Decimal type
    console.log('\ntotal:', updateData.total, typeof updateData.total);
    console.log('subtotal:', updateData.subtotal, typeof updateData.subtotal);
}

try {
    simulatePatchHandler();
} catch (e) {
    console.error('❌ Error:', e.message);
}
