const prisma = require('./prismaClient');

/**
 * Analyzes and prints the storage usage of user tables.
 */
async function analyzeStorage() {
  console.log('\n--- Analyzing Database Storage ---');
  try {
    const tableSizes = await prisma.$queryRaw`
      SELECT
        relname AS "Table",
        pg_size_pretty(pg_total_relation_size(relid)) AS "Size",
        pg_stat_get_live_tuples(relid) AS "Rows"
      FROM pg_catalog.pg_statio_user_tables
      ORDER BY pg_total_relation_size(relid) DESC;
    `;
    console.table(tableSizes);
  } catch (error) {
    console.error('Error analyzing storage:', error.message);
  }
}

/**
 * Deletes records older than the specified number of days from high-growth tables.
 */
async function pruneOldLogs(days = 2) {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - days);

  console.log(`\n--- Pruning Data Older Than ${days} Days (${thresholdDate.toISOString()}) ---`);

  try {
    // Driver Location History
    const deletedLocations = await prisma.driverLocationHistory.deleteMany({
      where: { timestamp: { lt: thresholdDate } }
    });
    console.log(`- Deleted ${deletedLocations.count} records from DriverLocationHistory.`);

    // Activity Log
    const deletedActivity = await prisma.activityLog.deleteMany({
      where: { createdAt: { lt: thresholdDate } }
    });
    console.log(`- Deleted ${deletedActivity.count} records from ActivityLog.`);

    // Audit Log
    const deletedAudit = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: thresholdDate } }
    });
    console.log(`- Deleted ${deletedAudit.count} records from AuditLog.`);
    
    // Speed Violations
    const deletedViolations = await prisma.speedViolation.deleteMany({
      where: { createdAt: { lt: thresholdDate } }
    });
    console.log(`- Deleted ${deletedViolations.count} records from SpeedViolation.`);

  } catch (error) {
    console.error('Error pruning logs:', error.message);
  }
}

/**
 * Attempts to reclaim space using VACUUM. 
 * Note: VACUUM FULL targets physical file reduction but requires an exclusive lock.
 */
async function reclaimSpace() {
  console.log('\n--- Reclaiming Space (Maintenance) ---');
  try {
    // Prisma executes everything in a way that might not allow VACUUM if not careful.
    // Standard VACUUM is safer for live environments than VACUUM FULL.
    await prisma.$executeRawUnsafe('VACUUM "DriverLocationHistory";');
    await prisma.$executeRawUnsafe('VACUUM "ActivityLog";');
    await prisma.$executeRawUnsafe('VACUUM "AuditLog";');
    console.log('Maintenance vacuum completed.');
  } catch (err) {
    console.warn('Reclaim notice:', err.message);
  }
}

/**
 * Main function to run the cleanup process.
 */
async function runCleanup(days = 2) {
  console.log('Starting Database Cleanup Job...');
  try {
    await analyzeStorage();
    await pruneOldLogs(days);
    await reclaimSpace();
    await analyzeStorage();
    console.log('\nCleanup job finished successfully.');
  } catch (error) {
    console.error('Cleanup process failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  const days = process.argv[2] ? parseInt(process.argv[2]) : 2;
  runCleanup(days);
}

module.exports = { runCleanup };
