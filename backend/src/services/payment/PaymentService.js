const PayTRProvider = require('./providers/paytr');
const IyzicoProvider = require('./providers/iyzico');
const NestPayProvider = require('./providers/nestpay');

const prisma = require('../../lib/prisma');

class PaymentService {
    async initializePayment(tenantId, params) {
        // 1. Get Tenant Payment Configuration
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { paymentProviders: true }
        });

        if (!tenant || !tenant.paymentProviders) {
            throw new Error('Ödeme sağlayıcı ayarları bulunamadı.');
        }

        const providers = tenant.paymentProviders;
        let activeProvider = params.provider;

        // If no provider specified, pick the first enabled one
        if (!activeProvider) {
            if (providers.paytr && providers.paytr.enabled) activeProvider = 'paytr';
            else if (providers.iyzico && providers.iyzico.enabled) activeProvider = 'iyzico';
            else {
                // Check bank POS providers (bank_*)
                const banks = providers.banks || {};
                for (const [bankId, bankConfig] of Object.entries(banks)) {
                    if (bankConfig.enabled) {
                        activeProvider = `bank_${bankId}`;
                        break;
                    }
                }
            }
        }

        if (!activeProvider) {
            throw new Error('Aktif bir ödeme sağlayıcı bulunamadı.');
        }

        // 2. Resolve config
        let config;
        if (activeProvider.startsWith('bank_')) {
            const bankId = activeProvider.replace('bank_', '');
            const banks = providers.banks || {};
            config = banks[bankId];
            if (!config) throw new Error(`Banka POS yapılandırması bulunamadı: ${bankId}`);
        } else {
            config = providers[activeProvider];
        }

        if (!config || !config.enabled) {
            throw new Error(`${activeProvider} aktif değil veya yapılandırılmamış.`);
        }

        // 3. Instantiate Provider
        let paymentProvider;
        if (activeProvider.startsWith('bank_')) {
            paymentProvider = new NestPayProvider(config);
        } else {
            switch (activeProvider) {
                case 'paytr':
                    paymentProvider = new PayTRProvider(config);
                    break;
                case 'iyzico':
                    paymentProvider = new IyzicoProvider(config);
                    break;
                default:
                    throw new Error('Desteklenmeyen ödeme sağlayıcı: ' + activeProvider);
            }
        }

        // 4. Initialize Payment
        return await paymentProvider.initializePayment(params, tenantId);
    }
}

module.exports = new PaymentService();
