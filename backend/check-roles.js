const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const defaultTenantSlug = 'smarttravel-demo';
    const tenant = await prisma.tenant.findUnique({ where: { slug: defaultTenantSlug } });

    if (!tenant) {
        console.log('Tenant not found');
        return;
    }

    const roles = [
        { name: 'Acente Yöneticisi', type: 'AGENCY_ADMIN', code: 'AGENCY_ADMIN' },
        { name: 'Acente Personeli', type: 'AGENCY_STAFF', code: 'AGENCY_STAFF' }
    ];

    for (const r of roles) {
        const existing = await prisma.role.findFirst({
            where: { tenantId: tenant.id, type: r.type }
        });

        if (!existing) {
            console.log(`Creating missing role: ${r.type}`);
            await prisma.role.create({
                data: {
                    tenantId: tenant.id,
                    name: r.name,
                    code: r.code,
                    type: r.type,
                    isSystem: true,
                    description: `B2B ${r.name}`
                }
            });
        } else {
            console.log(`Role ${r.type} already exists.`);
        }
    }

    console.log('Done checking roles.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
