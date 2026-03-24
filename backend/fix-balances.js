const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Starting balance migration...');

    // 1. Agencies
    const agencies = await prisma.agency.findMany({
        include: { deposits: { where: { status: 'APPROVED' } } }
    });

    for (const agency of agencies) {
        if (Number(agency.debit) === 0 && Number(agency.credit) === 0 && Number(agency.balance) !== 0) {
            const currentBalance = Number(agency.balance) || 0;
            const totalDeposits = (agency.deposits || []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

            // Previous logic:
            // credit = totalDeposits
            // debit = totalDeposits - currentBalance
            // Wait, what if totalDeposits is 0 but balance is positive?
            // If we just initialize based on net:
            let newCredit = totalDeposits;
            let newDebit = totalDeposits - currentBalance;

            if (newDebit < 0) {
                // Means currentBalance > totalDeposits (e.g. earned profit)
                newCredit = currentBalance;
                newDebit = 0;
            }

            await prisma.agency.update({
                where: { id: agency.id },
                data: {
                    debit: newDebit,
                    credit: newCredit
                }
            });
            console.log(`Updated Agency ${agency.name}: Debit=${newDebit}, Credit=${newCredit}, Balance=${currentBalance}`);
        }
    }

    // 2. Personnel
    const personnels = await prisma.personnel.findMany();

    for (const p of personnels) {
        if (Number(p.debit) === 0 && Number(p.credit) === 0 && Number(p.balance) !== 0) {
            const currentBalance = Number(p.balance) || 0;
            const meta = typeof p.metadata === 'object' && p.metadata ? p.metadata : {};
            const totalAdvance = Number(meta.totalAdvance) || 0;
            const totalPaid = Number(meta.totalPaid) || 0;

            let newDebit = totalAdvance;
            let newCredit = totalPaid;

            // If they just had a static balance, we map it to debit or credit
            if (currentBalance > 0) {
                newCredit += currentBalance;
            } else if (currentBalance < 0) {
                newDebit += Math.abs(currentBalance);
            }

            await prisma.personnel.update({
                where: { id: p.id },
                data: {
                    debit: newDebit,
                    credit: newCredit
                }
            });
            console.log(`Updated Personnel ${p.firstName}: Debit=${newDebit}, Credit=${newCredit}`);
        }
    }

    // 3. User (Partners)
    const partners = await prisma.user.findMany({
        where: { role: { type: 'PARTNER' } }
    });

    for (const p of partners) {
        if (Number(p.debit) === 0 && Number(p.credit) === 0 && Number(p.balance) !== 0) {
            const currentBalance = Number(p.balance) || 0;
            let newDebit = 0;
            let newCredit = 0;

            if (currentBalance > 0) {
                newCredit = currentBalance;
            } else {
                newDebit = Math.abs(currentBalance);
            }

            await prisma.user.update({
                where: { id: p.id },
                data: {
                    debit: newDebit,
                    credit: newCredit
                }
            });
            console.log(`Updated Partner ${p.firstName}: Debit=${newDebit}, Credit=${newCredit}`);
        }
    }

    // 4. Accounts
    const accounts = await prisma.account.findMany();
    for (const acc of accounts) {
        if (Number(acc.debit) === 0 && Number(acc.credit) === 0 && Number(acc.balance) !== 0) {
            const currentBalance = Number(acc.balance) || 0;
            let newDebit = 0;
            let newCredit = 0;

            if (currentBalance > 0) {
                newCredit = currentBalance;
            } else {
                newDebit = Math.abs(currentBalance);
            }

            await prisma.account.update({
                where: { id: acc.id },
                data: {
                    debit: newDebit,
                    credit: newCredit
                }
            });
            console.log(`Updated Account ${acc.name}: Debit=${newDebit}, Credit=${newCredit}`);
        }
    }

    console.log('Migration complete.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
