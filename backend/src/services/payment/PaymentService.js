const PayTRProvider = require('./providers/paytr');
const IyzicoProvider = require('./providers/iyzico');

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
        }

        if (!activeProvider) {
            throw new Error('Aktif bir ödeme sağlayıcı bulunamadı.');
        }

        const config = providers[activeProvider];

        if (!config || !config.enabled) {
            throw new Error(`${activeProvider} aktif değil veya yapılandırılmamış.`);
        }

        // 2. Instantiate Provider
        let paymentProvider;
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

        // 3. Initialize Payment
        return await paymentProvider.initializePayment(params, tenantId);
    }
}

module.exports = new PaymentService();
