const Iyzipay = require('iyzipay');

class IyzicoProvider {
    /**
     * @param {Object} config - { apiKey, secretKey, baseUrl, testMode }
     */
    constructor(config) {
        this.config = config;

        // Determine Base URL
        let baseUrl = config.baseUrl || 'https://api.iyzipay.com';
        if (config.testMode) {
            baseUrl = 'https://sandbox-api.iyzipay.com';
        }

        this.iyzipay = new Iyzipay({
            apiKey: config.apiKey,
            secretKey: config.secretKey,
            uri: baseUrl
        });
    }

    /**
     * Initialize payment (Checkout Form)
     * @param {Object} params
     * @param {string} tenantId 
     * @returns {Promise<{ html: string }>} Script/HTML content
     */
    initializePayment(params, tenantId) {
        return new Promise((resolve, reject) => {
            const request = {
                locale: Iyzipay.LOCALE.TR,
                conversationId: params.orderId,
                price: params.amount.toString(),
                paidPrice: params.amount.toString(),
                currency: params.currency === 'USD' ? Iyzipay.CURRENCY.USD : (params.currency === 'EUR' ? Iyzipay.CURRENCY.EUR : Iyzipay.CURRENCY.TRY),
                basketId: params.orderId,
                paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
                // Iyzico requires the callback to hit the Backend to retrieve token summary
                callbackUrl: `${process.env.BACKEND_URL || 'https://smarttransfer-backend-production.up.railway.app'}/api/payment/callback/iyzico?tenantId=${tenantId}`,
                enabledInstallments: [1],
                buyer: {
                    id: params.user.id || 'Unknown',
                    name: params.user.name.split(' ')[0] || 'Misafir',
                    surname: params.user.name.split(' ').slice(1).join(' ') || 'Kullanıcı',
                    gsmNumber: params.user.phone || '+905555555555',
                    email: params.user.email,
                    identityNumber: '11111111111', // Mandatory for Iyzico, can be dummy for foreign cards but required field
                    lastLoginDate: '2023-01-01 12:00:00',
                    registrationDate: '2023-01-01 12:00:00',
                    registrationAddress: params.user.address || 'Adres yok',
                    ip: params.userIp || '127.0.0.1',
                    city: 'Istanbul',
                    country: 'Turkey',
                    zipCode: '34732'
                },
                shippingAddress: {
                    contactName: params.user.name,
                    city: 'Istanbul',
                    country: 'Turkey',
                    address: params.user.address || 'Adres yok',
                    zipCode: '34732'
                },
                billingAddress: {
                    contactName: params.user.name,
                    city: 'Istanbul',
                    country: 'Turkey',
                    address: params.user.address || 'Adres yok',
                    zipCode: '34732'
                },
                basketItems: params.basket.map(item => ({
                    id: item.code || Math.random().toString(36).substring(7),
                    name: item.name,
                    category1: item.category || 'Transfer',
                    category2: 'Transfer',
                    itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
                    price: item.price.toString()
                }))
            };

            this.iyzipay.checkoutFormInitialize.create(request, (err, result) => {
                if (err) {
                    return reject(err);
                }

                if (result.status === 'success') {
                    resolve({
                        success: true,
                        html: result.checkoutFormContent,
                        raw: result
                    });
                } else {
                    resolve({
                        success: false,
                        error: result.errorMessage,
                        raw: result
                    });
                }
            });
        });
    }
}

module.exports = IyzicoProvider;
