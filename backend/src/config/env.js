/**
 * Central environment configuration — no hardcoded secrets or fallbacks in production.
 */

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

const config = {
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction,
    isTest,

    port: parseInt(process.env.PORT || '4000', 10),

    databaseUrl: requireEnv('DATABASE_URL', { devDefault: 'postgresql://localhost:5432/smarttransfer' }),

    jwt: {
        secret: requireEnv('JWT_SECRET', {
            devDefault: isProduction || isTest ? undefined : 'dev-local-jwt-secret-min-32-characters!!',
        }),
        expiration: optionalEnv('JWT_EXPIRATION', '7d'),
        refreshExpiration: optionalEnv('REFRESH_TOKEN_EXPIRATION', '7d'),
    },

    urls: {
        backend: optionalEnv('BACKEND_URL'),
        frontend: optionalEnv('FRONTEND_URL'),
    },

    security: {
        aiSecretToken: requireEnv('AI_SECRET_TOKEN', {
            devDefault: isProduction || isTest ? undefined : 'dev-local-ai-secret-token',
        }),
        uetdsEncryptionKey: requireEnv('UETDS_ENCRYPTION_KEY', {
            devDefault: isProduction || isTest ? undefined : 'dev-uetds-key-32-chars-exact!!',
        }),
        n8nWebhookSecret: optionalEnv('N8N_WEBHOOK_SECRET'),
    },

    tenant: {
        /** Only used in development when no tenant header/subdomain is present */
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
    if (config.security.uetdsEncryptionKey.length !== 32 && isProduction) {
        throw new Error('UETDS_ENCRYPTION_KEY must be exactly 32 characters in production');
    }
}

validateConfig();

module.exports = config;
