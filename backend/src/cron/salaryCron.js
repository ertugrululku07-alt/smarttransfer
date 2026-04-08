const cron = require('node-cron');

const prisma = require('../lib/prisma');

/**
 * Process salaries for all tenants.
 * Iterates every month from each personnel's start date up to today,
 * and creates missing salary accrual records for any period whose
 * payment day has already passed.
 */
async function processSalaries() {
    console.log('[SALARY] Starting salary processing...');
    try {
        const todayTz = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
        const todayDay = todayTz.getDate();
        const todayMonth = todayTz.getMonth(); // 0-11
        const todayYear = todayTz.getFullYear();

        const tenants = await prisma.tenant.findMany({ where: { deletedAt: null } });

        for (const tenant of tenants) {
            const settings = tenant.settings || {};
            const paymentDay = settings.salaryPaymentDay ? parseInt(settings.salaryPaymentDay) : null;
            if (!paymentDay) continue;

            const activePersonnelList = await prisma.personnel.findMany({
                where: { tenantId: tenant.id, isActive: true, deletedAt: null }
            });

            for (const personnel of activePersonnelList) {
                if (!personnel.salary || personnel.salary <= 0) continue;
                if (!personnel.startDate) continue;

                const monthlySalary = parseFloat(personnel.salary);
                const startDate = new Date(new Date(personnel.startDate).toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));

                // Determine the first accrual month:
                // If the personnel started before or on the paymentDay of their start month,
                // the first accrual is that month; otherwise the next month.
                let firstYear = startDate.getFullYear();
                let firstMonth = startDate.getMonth(); // 0-11
                if (startDate.getDate() > paymentDay) {
                    // Started after the payment day → first accrual is next month
                    firstMonth++;
                    if (firstMonth > 11) { firstMonth = 0; firstYear++; }
                }

                // Iterate month by month from first accrual to today
                let y = firstYear;
                let m = firstMonth;

                while (y < todayYear || (y === todayYear && m <= todayMonth)) {
                    // Only process if the payment day has already passed in this month
                    if (y === todayYear && m === todayMonth && todayDay < paymentDay) {
                        break; // Payment day hasn't arrived yet this month
                    }

                    const periodStr = `${y}-${(m + 1).toString().padStart(2, '0')}`;

                    // Check if already processed
                    const existing = await prisma.transaction.findFirst({
                        where: {
                            tenantId: tenant.id,
                            accountId: `personnel-${personnel.id}`,
                            type: 'SALARY',
                            isCredit: true,
                            description: { contains: `Maaş Hak Edişi - Dönem: ${periodStr}` }
                        }
                    });

                    if (!existing) {
                        // Calculate prorated or full salary
                        // Payment date for this period
                        const payDate = new Date(y, m, paymentDay);
                        const diffTime = payDate.getTime() - startDate.getTime();
                        const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

                        let hakedis = monthlySalary;
                        let note = 'Tam ay';
                        if (diffDays < 30) {
                            hakedis = (monthlySalary / 30) * diffDays;
                            note = `${diffDays} günlük kıst`;
                        }

                        const amountToPay = parseFloat(hakedis.toFixed(2));
                        if (amountToPay > 0) {
                            await prisma.$transaction(async (tx) => {
                                await tx.transaction.create({
                                    data: {
                                        tenantId: tenant.id,
                                        accountId: `personnel-${personnel.id}`,
                                        type: 'SALARY',
                                        amount: amountToPay,
                                        currency: 'TRY',
                                        isCredit: true,
                                        description: `Personel Maaş Hak Edişi - Dönem: ${periodStr}`,
                                        date: payDate
                                    }
                                });

                                const currentP = await tx.personnel.findUnique({ where: { id: personnel.id } });
                                const meta = (currentP.metadata && typeof currentP.metadata === 'object') ? currentP.metadata : { transactions: [] };
                                if (!Array.isArray(meta.transactions)) meta.transactions = [];

                                meta.transactions.push({
                                    id: `tx-hakedis-${Date.now()}-${personnel.id}-${periodStr}`,
                                    type: 'ENTITLEMENT',
                                    amount: amountToPay,
                                    note: `Otomatik Maaş Hak Edişi (${note})`,
                                    period: periodStr,
                                    date: new Date().toISOString(),
                                    createdBy: 'SYSTEM'
                                });

                                await tx.personnel.update({
                                    where: { id: personnel.id },
                                    data: {
                                        balance: { increment: amountToPay },
                                        credit: { increment: amountToPay },
                                        metadata: meta
                                    }
                                });
                            });

                            console.log(`[SALARY] Hak Edis: ${personnel.firstName} ${personnel.lastName} | ${periodStr} | ${amountToPay} TL (${note})`);
                        }
                    }

                    // Next month
                    m++;
                    if (m > 11) { m = 0; y++; }
                }
            }
        }
        console.log('[SALARY] Salary processing completed.');
    } catch (error) {
        console.error('[SALARY] Error during salary processing:', error);
    }
}

const initSalaryCron = () => {
    // Run at 00:01 every day
    cron.schedule('1 0 * * *', () => processSalaries());

    // Also run on startup after a short delay to catch any missed periods
    setTimeout(() => processSalaries(), 5000);

    console.log('⏱️  Salary cron job initialized (runs daily + on startup).');
};

module.exports = initSalaryCron;
