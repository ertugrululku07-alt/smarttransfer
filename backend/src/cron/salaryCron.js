const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const initSalaryCron = () => {
    // Run at 00:01 every day
    cron.schedule('1 0 * * *', async () => {
        console.log('[CRON] Starting daily salary processing job...');
        try {
            // Get today's date in Turkey timezone
            const todayTz = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
            const todayDay = todayTz.getDate();
            const currentMonth = todayTz.getMonth(); // 0-11
            const currentYear = todayTz.getFullYear();

            // Find all tenants
            const tenants = await prisma.tenant.findMany({
                where: { deletedAt: null }
            });

            for (const tenant of tenants) {
                const settings = tenant.settings || {};
                const paymentDay = settings.salaryPaymentDay ? parseInt(settings.salaryPaymentDay) : null;

                // Skip if payment day is not set or not today
                if (!paymentDay || paymentDay !== todayDay) {
                    continue;
                }

                console.log(`[CRON] Processing salaries for tenant ${tenant.name} (${tenant.id})`);

                // Find all active personnel
                const activePersonnelList = await prisma.personnel.findMany({
                    where: {
                        tenantId: tenant.id,
                        isActive: true,
                        deletedAt: null
                    }
                });

                for (const personnel of activePersonnelList) {
                    if (!personnel.salary || personnel.salary <= 0) continue;

                    const monthlySalary = parseFloat(personnel.salary);
                    const startDate = new Date(personnel.startDate);
                    let hakedis = monthlySalary;

                    // Simple Prorated Calculation (based on 30-day month)
                    const diffTime = todayTz.getTime() - startDate.getTime();
                    const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

                    if (diffDays < 30) {
                        // Yeni başlayan personel için 30 gün üzerinden kıst maaş
                        hakedis = (monthlySalary / 30) * diffDays;
                    }

                    const amountToPay = parseFloat(hakedis.toFixed(2));

                    if (amountToPay <= 0) continue;

                    const periodStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}`;

                    const isAlreadyProcessed = await prisma.transaction.findFirst({
                        where: {
                            tenantId: tenant.id,
                            accountId: `personnel-${personnel.id}`,
                            type: 'SALARY',
                            isCredit: true,
                            description: {
                                contains: `Maaş Hak Edişi - Dönem: ${periodStr}`
                            }
                        }
                    });

                    if (isAlreadyProcessed) {
                        console.log(`[CRON] Salary already processed for personnel ${personnel.id} for period ${periodStr}`);
                        continue;
                    }

                    await prisma.$transaction(async (tx) => {
                        // Create transaction record
                        await tx.transaction.create({
                            data: {
                                tenantId: tenant.id,
                                accountId: `personnel-${personnel.id}`,
                                type: 'SALARY',
                                amount: amountToPay,
                                currency: 'TRY',
                                isCredit: true, // Hak ediş (Alacak)
                                description: `Personel Maaş Hak Edişi - Dönem: ${periodStr}`,
                                date: new Date()
                            }
                        });

                        const currentP = await tx.personnel.findUnique({ where: { id: personnel.id } });
                        const meta = (currentP.metadata && typeof currentP.metadata === 'object') ? currentP.metadata : { transactions: [] };
                        if (!Array.isArray(meta.transactions)) meta.transactions = [];

                        meta.transactions.push({
                            id: `tx-hakedis-${Date.now()}-${personnel.id}`,
                            type: 'ENTITLEMENT', // NEW TYPE
                            amount: amountToPay,
                            note: `Otomatik Maaş Hak Edişi (${diffDays < 30 ? diffDays + ' günlük kıst' : 'Tam ay'})`,
                            period: periodStr,
                            date: new Date().toISOString(),
                            createdBy: 'SYSTEM'
                        });

                        // Update personnel balance
                        await tx.personnel.update({
                            where: { id: personnel.id },
                            data: {
                                balance: { increment: amountToPay },
                                credit: { increment: amountToPay },
                                metadata: meta
                            }
                        });
                    });

                    console.log(`[CRON] Salary Hak Edis processed for ${personnel.firstName} ${personnel.lastName} : ${amountToPay}`);
                }
            }
            console.log('[CRON] Daily salary processing job completed.');
        } catch (error) {
            console.error('[CRON] Error during salary processing:', error);
        }
    });

    console.log('⏱️  Salary cron job initialized.');
};

module.exports = initSalaryCron;
