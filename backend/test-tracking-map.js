const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

async function testTrackingMap() {
    try {
        const vehicles = await prisma.vehicle.findMany({
            where: { tenantId: TENANT_ID, status: { not: 'RETIRED' } },
            include: { vehicleType: true }
        });

        const transfers = await prisma.booking.findMany({
            where: { tenantId: TENANT_ID, status: { in: ['COMPLETED', 'CONFIRMED'] } },
            select: { metadata: true }
        });

        const kmByVehicle = {};
        transfers.forEach(t => {
            const trackingMeta = t.metadata || {};
            const assignedVehicleId = trackingMeta.assignedVehicleId;
            const routeDetails = trackingMeta.routeDetails || {};

            if (!assignedVehicleId) return;
            const km = routeDetails.distance_km || trackingMeta.distanceKm || trackingMeta.distance || 0;
            kmByVehicle[assignedVehicleId] = (kmByVehicle[assignedVehicleId] || 0) + Number(km);
        });

        const now = new Date();
        const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        console.log("Starting mapping...");
        const data = vehicles.map((v, index) => {
            const meta = v.metadata || {};
            const tracking = meta.tracking || {};
            const ins = tracking.insurance || [];
            const fuel = tracking.fuel || [];
            const insp = tracking.inspection || [];
            const maint = tracking.maintenance || [];

            const activeIns = ins.find(i => new Date(i.endDate) >= now);
            const lastInsp = insp.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            const nextInspDate = lastInsp?.nextDate ? new Date(lastInsp.nextDate) : null;

            const totalFuelCost = fuel.reduce((s, f) => s + (Number(f.totalCost) || 0), 0);
            const totalMaintCost = maint.reduce((s, m) => s + (Number(m.cost) || 0), 0);
            const totalInsCost = ins.reduce((s, i) => s + (Number(i.cost) || 0), 0);
            const totalFuelLiters = fuel.reduce((s, f) => s + (Number(f.liters) || 0), 0);

            const transferKm = kmByVehicle[v.id] || 0;
            const manualKm = tracking.totalKm || 0;
            const totalKm = Math.max(transferKm, manualKm);

            return {
                id: v.id,
                plateNumber: v.plateNumber,
                status: v.status,
                totalKm
            };
        });

        console.log("Mapping successful!");
        console.log(data);

    } catch (err) {
        console.error('Fatal Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

testTrackingMap();
