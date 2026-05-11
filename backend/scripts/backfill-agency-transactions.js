/**
 * Backfill missing Transaction records for existing B2B bookings.
 *
 * Problem: Before the fix, only BALANCE-paid bookings created Transaction records.
 * PAY_IN_VEHICLE and CREDIT_CARD bookings created NO accounting entries.
 * Also, no currency was stored — everything defaulted to TRY.
 *
 * This script:
 * 1. Finds all B2B bookings that have NO matching Transaction record
 * 2. Creates PURCHASE_INVOICE (debit) for the B2B cost
 * 3. Creates SALES_INVOICE (credit) for the markup if customer price > B2B cost
 * 4. For cancelled bookings with refund, creates reversal entries
 *
 * Usage: node scripts/backfill-agency-transactions.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('=== Backfill Agency Transactions ===\n');

    // Find all B2B bookings (bookingType = 'B2B' or agencyId is set)
    const bookings = await prisma.booking.findMany({
        where: {
            agencyId: { not: null }
        },
        select: {
            id: true,
            tenantId: true,
            agencyId: true,
            bookingNumber: true,
            currency: true,
            subtotal: true, // B2B cost
            total: true,    // Customer price
            status: true,
            paymentStatus: true,
            metadata: true,
            createdAt: true
        },
        orderBy: { createdAt: 'asc' }
    });

    console.log(`Found ${bookings.length} B2B bookings total.\n`);

    // Get all existing transaction referenceIds to check which bookings already have entries
    const existingTxs = await prisma.transaction.findMany({
        where: {
            referenceId: { in: bookings.map(b => b.id) }
        },
        select: { referenceId: true }
    });
    const existingRefIds = new Set(existingTxs.map(t => t.referenceId));

    let created = 0;
    let skipped = 0;

    for (const booking of bookings) {
        if (existingRefIds.has(booking.id)) {
            skipped++;
            continue;
        }

        const b2bCost = Number(booking.subtotal || 0);
        const customerPrice = Number(booking.total || 0);
        const markup = customerPrice - b2bCost;
        const cur = booking.currency || 'TRY';
        const payMethod = booking.metadata?.paymentMethod || 'BALANCE';
        const accountId = `agency-${booking.agencyId}`;

        if (b2bCost <= 0) {
            skipped++;
            continue;
        }

        const txsToCreate = [];

        // 1. PURCHASE_INVOICE (debit) — the B2B cost
        txsToCreate.push({
            tenantId: booking.tenantId,
            accountId,
            type: 'PURCHASE_INVOICE',
            amount: b2bCost,
            currency: cur,
            isCredit: false,
            description: `B2B Transfer Satın Alma – ${payMethod === 'BALANCE' ? 'Bakiyeden' : payMethod === 'PAY_IN_VEHICLE' ? 'Araçta Ödeme' : 'Kredi Kartı'} (PNR: ${booking.bookingNumber}) [Backfill]`,
            date: booking.createdAt,
            referenceId: booking.id
        });

        // 2. SALES_INVOICE (credit) — markup/commission if any
        if (markup > 0) {
            txsToCreate.push({
                tenantId: booking.tenantId,
                accountId,
                type: 'SALES_INVOICE',
                amount: markup,
                currency: cur,
                isCredit: true,
                description: `Acente Komisyon/Kâr (PNR: ${booking.bookingNumber}) [Backfill]`,
                date: booking.createdAt,
                referenceId: booking.id
            });
        }

        // 3. If cancelled with refund, add reversal entries
        if (booking.status === 'CANCELLED') {
            txsToCreate.push({
                tenantId: booking.tenantId,
                accountId,
                type: 'PAYMENT_RECEIVED',
                amount: b2bCost,
                currency: cur,
                isCredit: true,
                description: `İptal İadesi – B2B Maliyet (PNR: ${booking.bookingNumber}) [Backfill]`,
                date: booking.createdAt,
                referenceId: booking.id
            });

            if (markup > 0) {
                txsToCreate.push({
                    tenantId: booking.tenantId,
                    accountId,
                    type: 'PAYMENT_SENT',
                    amount: markup,
                    currency: cur,
                    isCredit: false,
                    description: `İptal – Komisyon İptali (PNR: ${booking.bookingNumber}) [Backfill]`,
                    date: booking.createdAt,
                    referenceId: booking.id
                });
            }
        }

        await prisma.transaction.createMany({ data: txsToCreate });
        created += txsToCreate.length;
        console.log(`  ✅ ${booking.bookingNumber} (${cur}) → ${txsToCreate.length} transaction(s) created [${payMethod}]`);
    }

    console.log(`\n=== Done ===`);
    console.log(`  Created: ${created} transactions`);
    console.log(`  Skipped: ${skipped} bookings (already had transactions or zero amount)`);
}

main()
    .catch(e => { console.error('Migration failed:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
