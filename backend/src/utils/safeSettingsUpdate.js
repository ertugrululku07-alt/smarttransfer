/**
 * SAFE Settings Update Utility
 * ALWAYS reads fresh settings from DB before modifying.
 * NEVER relies on req.tenant.settings (which may be incomplete due to select fields).
 * Includes validation to prevent accidental wipes.
 */

const prisma = require('../lib/prisma');
const { clearTenantCache } = require('../middleware/tenant');

/**
 * Safely update a specific key in tenant settings.
 * Reads current settings from DB, merges the update, validates, then saves.
 * 
 * @param {string} tenantId - Tenant ID
 * @param {string} tenantSlug - Tenant slug (for cache clearing)
 * @param {string} key - The settings key to update (e.g., 'deeplApiKey', 'pages', 'branding')
 * @param {any} value - The new value for that key
 * @returns {object} - { success: boolean, settings: object }
 */
async function updateSettingsKey(tenantId, tenantSlug, key, value) {
    if (!tenantId) throw new Error('tenantId is required');
    if (!key) throw new Error('settings key is required');

    // ALWAYS read fresh from DB
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true }
    });

    if (!tenant) throw new Error('Tenant not found');

    const currentSettings = tenant.settings || {};
    const updatedSettings = { ...currentSettings, [key]: value };

    // SAFETY CHECK: new settings must not be smaller than 50% of current settings
    // (protects against accidental wipes)
    const currentSize = JSON.stringify(currentSettings).length;
    const newSize = JSON.stringify(updatedSettings).length;
    
    if (currentSize > 500 && newSize < currentSize * 0.5) {
        console.error(`[SAFETY BLOCK] Settings update for key "${key}" would reduce settings from ${currentSize} to ${newSize} chars. Blocked.`);
        throw new Error(`Settings safety check failed: update would reduce data by more than 50%. Current: ${currentSize} chars, New: ${newSize} chars`);
    }

    await prisma.tenant.update({
        where: { id: tenantId },
        data: { settings: updatedSettings }
    });

    // Clear tenant cache
    if (tenantSlug) {
        clearTenantCache(tenantId, tenantSlug);
    }

    return { success: true, settings: updatedSettings };
}

/**
 * Safely update multiple keys in tenant settings at once.
 * 
 * @param {string} tenantId
 * @param {string} tenantSlug
 * @param {object} updates - Object with key-value pairs to merge into settings
 * @returns {object}
 */
async function updateSettingsMultiple(tenantId, tenantSlug, updates) {
    if (!tenantId) throw new Error('tenantId is required');
    if (!updates || typeof updates !== 'object') throw new Error('updates object is required');

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true }
    });

    if (!tenant) throw new Error('Tenant not found');

    const currentSettings = tenant.settings || {};
    const updatedSettings = { ...currentSettings, ...updates };

    // SAFETY CHECK
    const currentSize = JSON.stringify(currentSettings).length;
    const newSize = JSON.stringify(updatedSettings).length;
    
    if (currentSize > 500 && newSize < currentSize * 0.5) {
        console.error(`[SAFETY BLOCK] Bulk settings update would reduce settings from ${currentSize} to ${newSize} chars. Blocked.`);
        throw new Error(`Settings safety check failed: update would reduce data by more than 50%.`);
    }

    await prisma.tenant.update({
        where: { id: tenantId },
        data: { settings: updatedSettings }
    });

    if (tenantSlug) {
        clearTenantCache(tenantId, tenantSlug);
    }

    return { success: true, settings: updatedSettings };
}

module.exports = { updateSettingsKey, updateSettingsMultiple };
