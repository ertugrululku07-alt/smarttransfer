const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Creates an activity log entry in the database.
 * @param {Object} params
 * @param {string} params.tenantId - The tenant's ID
 * @param {string} [params.userId] - ID of the user performing the action
 * @param {string} [params.userEmail] - Email of the user performing the action
 * @param {string} params.action - e.g., CREATE_BOOKING, CANCEL_BOOKING
 * @param {string} [params.entityType] - e.g., Booking, Vehicle, User
 * @param {string} [params.entityId] - The ID of the affected record
 * @param {Object} [params.details] - JSON payload containing differences, state snapshots or human readable messages
 * @param {string} [params.ipAddress] - IP Address of the requester
 */
async function logActivity({
    tenantId,
    userId = null,
    userEmail = null,
    action,
    entityType = null,
    entityId = null,
    details = null,
    ipAddress = null
}) {
    if (!tenantId) {
        console.warn('logActivity skipped: tenantId is missing');
        return;
    }

    try {
        await prisma.activityLog.create({
            data: {
                tenantId,
                userId,
                userEmail,
                action,
                entityType,
                entityId: entityId ? String(entityId) : null,
                details,
                ipAddress
            }
        });
    } catch (error) {
        console.error('Failed to write activity log:', error);
    }
}

module.exports = {
    logActivity
};
