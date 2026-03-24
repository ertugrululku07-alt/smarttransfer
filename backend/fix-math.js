const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Restoring mathematical consistency: balance = credit - debit');

    // 1. Partners
    const partnerRoles = await prisma.role.findMany({ where: { type: 'PARTNER' } });
    const pIds = partnerRoles.map(r => r.id);
    const partners = await prisma.user.findMany({ where: { roleId: { in: pIds } } });
    for (const p of partners) {
        const bal = parseFloat(p.balance) || 0;
        const deb = parseFloat(p.debit) || 0;
        const cred = parseFloat(p.credit) || 0;
        if (Math.abs(bal - (cred - deb)) > 0.01) {
            // Assume balance and debit are the most recent "true" values from the user.
            // (e.g. Borç was added, Bakiye was correct historically).
            // Actually, if Bakiye was 8423 and Debit was 6240, then Credit should be 14663
            const fixedCredit = bal + deb;
            await prisma.user.update({
                where: { id: p.id },
                data: { credit: fixedCredit }
            });
            console.log(`Fixed Partner ${p.firstName}: old credit=${cred} -> new credit=${fixedCredit}`);
        }
    }

    // 2. Agencies
    const agencies = await prisma.agency.findMany();
    for (const a of agencies) {
        const bal = parseFloat(a.balance) || 0;
        const deb = parseFloat(a.debit) || 0;
        const cred = parseFloat(a.credit) || 0;
        if (Math.abs(bal - (cred - deb)) > 0.01) {
            const fixedCredit = bal + deb;
            await prisma.agency.update({
                where: { id: a.id },
                data: { credit: fixedCredit }
            });
            console.log(`Fixed Agency ${a.name}: old credit=${cred} -> new credit=${fixedCredit}`);
        }
    }

    // 3. Personnel
    const personnel = await prisma.personnel.findMany();
    for (const p of personnel) {
        const bal = parseFloat(p.balance) || 0;
        const deb = parseFloat(p.debit) || 0;
        const cred = parseFloat(p.credit) || 0;
        if (Math.abs(bal - (cred - deb)) > 0.01) {
            const fixedCredit = bal + deb;
            await prisma.personnel.update({
                where: { id: p.id },
                data: { credit: fixedCredit }
            });
            console.log(`Fixed Personnel ${p.firstName}: old credit=${cred} -> new credit=${fixedCredit}`);
        }
    }

    // 4. Standard Accounts
    const accounts = await prisma.account.findMany();
    for (const ac of accounts) {
        const bal = parseFloat(ac.balance) || 0;
        const deb = parseFloat(ac.debit) || 0;
        const cred = parseFloat(ac.credit) || 0;
        if (Math.abs(bal - (cred - deb)) > 0.01) {
            const fixedCredit = bal + deb;
            await prisma.account.update({
                where: { id: ac.id },
                data: { credit: fixedCredit }
            });
            console.log(`Fixed Account ${ac.name}: old credit=${cred} -> new credit=${fixedCredit}`);
        }
    }

    console.log('Consistency check complete.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
