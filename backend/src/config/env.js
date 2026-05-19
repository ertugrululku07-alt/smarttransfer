/**
 * Central environment configuration.
 * Production requires DATABASE_URL and JWT_SECRET.
 * AI_SECRET_TOKEN / UETDS_ENCRYPTION_KEY may be omitted on first deploy — derived from JWT with a warning.
 */

const crypto = require('crypto');

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function requireEnv(name, { devDefault } = {}) {
    const value = process.env[name];
    if (value) return value;
    if (!isProduction && devDefault !== undefined) return devDefault;
    throw new Error(`Missing required environment variable: ${name}`);
}

function optionalEnv(name, defaultValue = '') {
    return process.env[name] || defaultValue;
}

/** Stable 32-char key derived from JWT when UETDS_ENCRYPTION_KEY is not set (migration only). */
function deriveUetdsKeyFromJwt(jwtSecret) {
    return crypto.createHash('sha256').update(`uetds-v1:${jwtSecret}`).digest('hex').slice(0, 32);
}

function resolveAiSecretToken(jwtSecret) {
    const fromEnv = process.env.AI_SECRET_TOKEN?.trim();
    if (fromEnv) return fromEnv;
    if (!isProduction) return 'dev-local-ai-secret-token';
    const derived = crypto.createHash('sha256').update(`ai-v1:${jwtSecret}`).digest('hex');
    console.warn(
        '[env] AI_SECRET_TOKEN is not set — using a value derived from JWT_SECRET. Set AI_SECRET_TOKEN explicitly in production.'
    );
    return derived;
}

function resolveUetdsEncryptionKey(jwtSecret) {
    const fromEnv = process.env.UETDS_ENCRYPTION_KEY?.trim();
    if (fromEnv) return fromEnv;
    if (!isProduction) return 'dev-uetds-key-32-chars-exact!!';
    const derived = deriveUetdsKeyFromJwt(jwtSecret);
    console.warn(
        '[env] UETDS_ENCRYPTION_KEY is not set — using a value derived from JWT_SECRET. Set UETDS_ENCRYPTION_KEY (32 chars) explicitly in production.'
    );
    return derived;
}

const jwtSecret = requireEnv('JWT_SECRET', {
    devDefault: isProduction || isTest ? undefined : 'dev-local-jwt-secret-min-32-characters!!',
});

const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction,
    isTest,

    port: parseInt(process.env.PORT || '4000', 10),

    databaseUrl: requireEnv('DATABASE_URL', { devDefault: 'postgresql://localhost:5432/smarttransfer' }),

    jwt: {
        secret: jwtSecret,
        expiration: optionalEnv('JWT_EXPIRATION', '7d'),
        refreshExpiration: optionalEnv('REFRESH_TOKEN_EXPIRATION', '7d'),
    },

    urls: {
        backend: optionalEnv('BACKEND_URL'),
        frontend: optionalEnv('FRONTEND_URL'),
    },

    security: {
        aiSecretToken: resolveAiSecretToken(jwtSecret),
        uetdsEncryptionKey: resolveUetdsEncryptionKey(jwtSecret),
        n8nWebhookSecret: optionalEnv('N8N_WEBHOOK_SECRET'),
    },

    tenant: {
        devDefaultSlug: optionalEnv('DEFAULT_TENANT_SLUG', 'smarttravel-demo'),
    },

    cors: {
        origins: optionalEnv('CORS_ORIGINS', '')
            .split(',')
            .map((o) => o.trim())
            .filter(Boolean),
    },
};

function validateConfig() {
    if (config.jwt.secret.length < 32 && isProduction) {
        throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
    if (config.security.uetdsEncryptionKey.length !== 32) {
        throw new Error('UETDS_ENCRYPTION_KEY must be exactly 32 characters');
    }
}

validateConfig();

module.exports = config;
