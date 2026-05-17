/**
 * Diagnose login failure for a specific email.
 *
 * Usage:
 *   node scripts/debug-login.js aa@aa.com 123456
 *
 * Outputs everything the auth route checks:
 *   - exact email match (case-sensitive raw row)
 *   - status, tenantId, tenant.status
 *   - password verification (bcrypt.compare)
 *   - role info
 *
 * If a problem is detected (wrong status, missing tenant, password fails),
 * pass --fix as third arg to RESET the password to the provided value AND
 * activate the user. Example:
 *   node scripts/debug-login.js aa@aa.com 123456 --fix
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    const email = (process.argv[2] || '').trim();
    const password = process.argv[3] || '';
    const doFix = process.argv.includes('--fix');

    if (!email || !password) {
        console.error('Usage: node scripts/debug-login.js <email> <password> [--fix]');
        process.exit(1);
    }

    console.log('────────────────────────────────────────────');
    console.log('🔍 Searching for user with email:', email);
    console.log('────────────────────────────────────────────');

    // Try multiple case variations to detect case mismatch
    const variants = [email, email.toLowerCase(), email.toUpperCase()];
    const rows = await prisma.user.findMany({
        where: { email: { in: Array.from(new Set(variants)) } },
        include: {
            role: true,
            tenant: { select: { id: true, name: true, status: true, slug: true } }
        }
    });

    if (rows.length === 0) {
        console.error('❌ NO user found in DB with ANY case variant of', email);
        console.error('   → Personnel might have been created with a different email.');
        return;
    }

    for (const u of rows) {
        console.log('\n📄 User row found:');
        console.log('   id:           ', u.id);
        console.log('   email (raw):  ', JSON.stringify(u.email));
        console.log('   email == lc?: ', u.email === u.email.toLowerCase() ? '✅ yes' : '❌ NO (CASE MISMATCH!)');
        console.log('   status:       ', u.status, u.status === 'ACTIVE' ? '✅' : '❌ NOT ACTIVE');
        console.log('   tenantId:     ', u.tenantId);
        console.log('   tenant:       ', u.tenant ? `${u.tenant.name} (status=${u.tenant.status})` : '❌ NULL');
        console.log('   role:         ', u.role ? `${u.role.code} / ${u.role.name} (type=${u.role.type})` : '❌ NULL');
        console.log('   passwordHash: ', u.passwordHash ? u.passwordHash.slice(0, 20) + '...' : '❌ NULL/empty');
        console.log('   firstName:    ', u.firstName, '/', u.lastName);

        if (u.passwordHash) {
            const ok = await bcrypt.compare(password, u.passwordHash);
            console.log('   password test:', ok ? '✅ MATCHES' : '❌ DOES NOT MATCH');
        }
    }

    if (doFix) {
        console.log('\n────────────────────────────────────────────');
        console.log('🛠  --fix flag set. Resetting password & activating user(s)…');
        const newHash = await bcrypt.hash(password, 10);
        for (const u of rows) {
            await prisma.user.update({
                where: { id: u.id },
                data: {
                    passwordHash: newHash,
                    status: 'ACTIVE',
                    email: u.email.toLowerCase(),
                }
            });
            console.log(`   ✅ Updated ${u.email}: password reset + status=ACTIVE + email lowercased`);
        }
    }

    console.log('\n────────────────────────────────────────────');
}

main()
    .catch(e => { console.error('Script error:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
